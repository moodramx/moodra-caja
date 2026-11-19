-- Transporte en vivo: el viaje se sigue con el GPS del celular (como una app de
-- taxis) y se guarda la distancia recorrida de verdad, con su ruta. Además la
-- gasolina se actualiza sola cada día con los precios que publica la CRE.

alter table public.trips
  add column tracked boolean not null default false,
  add column started_at timestamptz,
  add column ended_at timestamptz,
  -- Ruta simplificada, como polilínea codificada (la misma de Google Maps).
  add column path text check (length(path) <= 20000),
  -- Veces que el celular dejó de dar ubicación durante el viaje.
  add column gaps integer not null default 0 check (gaps >= 0),
  add constraint trips_tracked_un_sentido check (not (tracked and round_trip));

alter table public.app_settings
  -- Si está encendido, la función del servidor `fuel-prices` pone el precio
  -- del litro cada día (mediana de las gasolineras del Valle de México).
  add column fuel_auto boolean not null default true,
  add column fuel_updated_at timestamptz,
  add column fuel_checked_at timestamptz,
  add column fuel_source text check (length(fuel_source) <= 200);

create or replace function public.set_fuel_auto(p_auto boolean)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.app_settings;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  update public.app_settings
  set fuel_auto = coalesce(p_auto, true),
      -- Al encenderlo se vuelve a consultar en la siguiente oportunidad.
      fuel_checked_at = case when coalesce(p_auto, true) then null else fuel_checked_at end,
      updated_at = now(), updated_by = (select auth.uid())
  where id
  returning * into v;
  perform public.log_audit('transport.fuel_auto', 'app_settings', 'true',
    jsonb_build_object('auto', coalesce(p_auto, true)), null);
  return v;
end;
$$;

-- La usa solo la función del servidor (rol de servicio): guarda los precios del
-- día. No toca nada si la actualización automática está apagada.
create or replace function public.apply_fuel_prices(
  p_magna_cents bigint, p_premium_cents bigint, p_diesel_cents bigint, p_source text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if least(p_magna_cents, p_premium_cents, p_diesel_cents) < 1000
     or greatest(p_magna_cents, p_premium_cents, p_diesel_cents) > 6000 then
    raise exception 'Precios fuera de rango' using errcode = 'P0001';
  end if;
  update public.app_settings
  set fuel_magna_cents = p_magna_cents, fuel_premium_cents = p_premium_cents,
      fuel_diesel_cents = p_diesel_cents, fuel_updated_at = now(), fuel_checked_at = now(),
      fuel_source = left(p_source, 200)
  where id and fuel_auto;
  return found;
end;
$$;

create or replace function public.insert_transport_detail(
  p_event uuid, p_type public.event_type, p_payload jsonb, p_uid uuid, p_contador boolean, p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
  v_to uuid;
  v_distance integer;
  v_round boolean;
  v_meters numeric;
  v_traffic integer;
  v_wear bigint;
  v_sharers uuid[];
  v_total bigint := 0;
  car jsonb;
  veh public.vehicles;
  v_price bigint;
  v_fuel bigint;
  v_wear_cents bigint;
  v_toll bigint;
  v_toll_by uuid;
  v_riders uuid[];
  v_tracked boolean;
  v_path text;
  v_started timestamptz;
  v_ended timestamptz;
begin
  if p_type = 'pago_transporte' then
    v_from := (p_payload ->> 'from_member')::uuid;
    v_to := (p_payload ->> 'to_member')::uuid;
    if v_from is null or v_to is null or v_from = v_to then
      raise exception 'Elige quién le pagó a quién' using errcode = 'P0001';
    end if;
    if (select count(*) from public.profiles where id in (v_from, v_to)) <> 2 then
      raise exception 'Ese integrante no existe' using errcode = 'P0001';
    end if;
    if not p_contador and p_uid not in (v_from, v_to) then
      raise exception 'Solo quien paga o quien recibe registra ese pago' using errcode = '42501';
    end if;
    insert into public.transport_payments (event_id, from_member, to_member, amount_cents)
    values (p_event, v_from, v_to, p_amount);
    return;
  end if;

  -- Viaje
  v_distance := (p_payload ->> 'distance_m')::integer;
  if v_distance is null or v_distance < 1 or v_distance > 5000000 then
    raise exception 'Falta la distancia del viaje' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_payload ->> 'origin_name', ''))) = 0
     or length(btrim(coalesce(p_payload ->> 'dest_name', ''))) = 0 then
    raise exception 'Faltan el punto de salida y el destino' using errcode = 'P0001';
  end if;
  v_round := coalesce((p_payload ->> 'round_trip')::boolean, true);
  v_meters := v_distance::numeric * case when v_round then 2 else 1 end;
  v_traffic := coalesce((p_payload ->> 'traffic_pct')::integer, 0);
  if v_traffic < 0 or v_traffic > 50 then
    raise exception 'El ajuste por tráfico va de 0 a 50 %%' using errcode = 'P0001';
  end if;
  v_wear := coalesce((p_payload ->> 'wear_cents_per_km')::bigint,
                     (select wear_cents_per_km from public.app_settings where id));
  if v_wear < 0 or v_wear > 10000 then
    raise exception 'Revisa el desgaste por kilómetro' using errcode = 'P0001';
  end if;

  select array_agg(distinct s::uuid order by s::uuid) into v_sharers
  from jsonb_array_elements_text(coalesce(p_payload -> 'sharers', '[]'::jsonb)) s;
  if v_sharers is null then
    select array_agg(id order by id) into v_sharers from public.profiles where activo and participa_reparto;
  end if;
  if v_sharers is null
     or (select count(*) from public.profiles where id = any (v_sharers) and activo) <> cardinality(v_sharers) then
    raise exception 'Elige entre quiénes se reparte el viaje' using errcode = 'P0001';
  end if;
  -- Viaje seguido con el GPS del celular: la distancia es la recorrida de verdad.
  v_tracked := coalesce((p_payload ->> 'tracked')::boolean, false);
  v_path := nullif(p_payload ->> 'path', '');
  v_started := nullif(p_payload ->> 'started_at', '')::timestamptz;
  v_ended := nullif(p_payload ->> 'ended_at', '')::timestamptz;
  if v_tracked and v_round then
    raise exception 'Un viaje seguido en el mapa es de un solo sentido' using errcode = 'P0001';
  end if;
  if length(v_path) > 20000 then
    raise exception 'La ruta del viaje es demasiado larga' using errcode = 'P0001';
  end if;
  if v_started is not null and v_ended is not null and v_ended < v_started then
    raise exception 'Revisa la hora del viaje' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'cars', '[]'::jsonb)) = 0 then
    raise exception 'Agrega al menos un auto' using errcode = 'P0001';
  end if;

  insert into public.trips
    (event_id, origin_name, origin_address, dest_name, dest_address, purpose, round_trip, distance_m,
     duration_s, traffic_pct, wear_cents_per_km, sharers, total_cents, note,
     tracked, started_at, ended_at, path, gaps)
  values
    (p_event, btrim(p_payload ->> 'origin_name'), nullif(btrim(p_payload ->> 'origin_address'), ''),
     btrim(p_payload ->> 'dest_name'), nullif(btrim(p_payload ->> 'dest_address'), ''),
     (p_payload ->> 'purpose')::public.trip_purpose, v_round, v_distance,
     nullif(p_payload ->> 'duration_s', '')::integer, v_traffic, v_wear, v_sharers, 1,
     nullif(btrim(p_payload ->> 'note'), ''),
     v_tracked, v_started, v_ended, v_path,
     least(greatest(coalesce((p_payload ->> 'gaps')::integer, 0), 0), 9999));

  for car in select * from jsonb_array_elements(p_payload -> 'cars')
  loop
    select * into veh from public.vehicles where id = (car ->> 'vehicle_id')::uuid;
    if veh.id is null then
      raise exception 'Ese auto no existe' using errcode = 'P0001';
    end if;
    v_price := coalesce((car ->> 'price_per_liter_cents')::bigint,
      (select case veh.fuel when 'magna' then fuel_magna_cents when 'premium' then fuel_premium_cents
                            else fuel_diesel_cents end
       from public.app_settings where id));
    if v_price < 1 or v_price > 100000 then
      raise exception 'Revisa el precio del litro' using errcode = 'P0001';
    end if;
    v_toll := coalesce((car ->> 'toll_cents')::bigint, 0);
    v_toll_by := nullif(car ->> 'toll_paid_by', '')::uuid;
    if v_toll < 0 or v_toll > 10000000 then
      raise exception 'Revisa el monto de casetas' using errcode = 'P0001';
    end if;
    if v_toll > 0 and (v_toll_by is null
       or not exists (select 1 from public.profiles where id = v_toll_by)) then
      raise exception 'Dinos quién pagó las casetas' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(distinct r::uuid), '{}') into v_riders
    from jsonb_array_elements_text(coalesce(car -> 'riders', '[]'::jsonb)) r;

    -- Gasolina: km ÷ rendimiento × precio, más el ajuste por tráfico.
    v_fuel := round(v_meters * v_price * (100 + v_traffic) / (1000 * veh.km_per_liter * 100));
    v_wear_cents := round(v_meters * v_wear / 1000);
    insert into public.trip_cars
      (event_id, vehicle_id, owner_id, riders, fuel, km_per_liter, price_per_liter_cents,
       fuel_cents, wear_cents, toll_cents, toll_paid_by)
    values (p_event, veh.id, veh.owner_id, v_riders, veh.fuel, veh.km_per_liter, v_price,
            v_fuel, v_wear_cents, v_toll, case when v_toll > 0 then v_toll_by end);
    v_total := v_total + v_fuel + v_wear_cents + v_toll;
  end loop;

  if v_total <= 0 then
    raise exception 'El viaje no tiene costo' using errcode = 'P0001';
  end if;
  update public.trips set total_cents = v_total where event_id = p_event;
end;
$$;

drop view public.v_trips;
create view public.v_trips with (security_invoker = true) as
select t.*, e.status, e.captured_at, e.created_by, e.project_id, e.show_id,
       (select coalesce(jsonb_agg(jsonb_build_object(
                 'vehicle_id', c.vehicle_id, 'vehicle_name', v.name, 'owner_id', c.owner_id,
                 'riders', c.riders, 'fuel', c.fuel, 'km_per_liter', c.km_per_liter,
                 'price_per_liter_cents', c.price_per_liter_cents, 'fuel_cents', c.fuel_cents,
                 'wear_cents', c.wear_cents, 'toll_cents', c.toll_cents, 'toll_paid_by', c.toll_paid_by)
               order by v.name), '[]'::jsonb)
        from public.trip_cars c join public.vehicles v on v.id = c.vehicle_id
        where c.event_id = t.event_id) as cars
from public.trips t
join public.events e on e.id = t.event_id;

revoke all on public.v_trips from anon, authenticated;
grant select on public.v_trips to authenticated;

revoke execute on function public.set_fuel_auto(boolean), public.apply_fuel_prices(bigint, bigint, bigint, text),
  public.insert_transport_detail(uuid, public.event_type, jsonb, uuid, boolean, bigint)
from public, anon, authenticated;
grant execute on function public.set_fuel_auto(boolean) to authenticated;
grant execute on function public.apply_fuel_prices(bigint, bigint, bigint, text) to service_role;

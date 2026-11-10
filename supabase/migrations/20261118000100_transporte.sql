-- Transporte entre integrantes. Cuando van a ensayar o a tocar, alguien pone el
-- auto y alguien paga el tag. Cada viaje cuesta gasolina estimada (km ÷
-- rendimiento × precio del litro, con ajuste por tráfico) + desgaste por km +
-- casetas. Ese costo se reparte en partes iguales entre los integrantes y se
-- salda ENTRE ELLOS (la banda no pone dinero).
--
-- Contabilidad de un viaje de costo T:
--   Cargo  Gasto de transporte (del proyecto o show)            T
--   Abono  Aportaciones de cada integrante (su parte)           T
--   y en las cuentas "Transporte entre integrantes" (suman cero):
--   Cargo  a quien le toca pagar más de lo que puso
--   Abono  a quien puso más de lo que le toca
-- Un pago entre integrantes solo mueve esas cuentas.

create type public.fuel_type as enum ('magna', 'premium', 'diesel');
create type public.trip_purpose as enum ('ensayo', 'show', 'otro');

select public.seed_account('1.6', 'Transporte entre integrantes', 'activo', 'deudora', false);
select public.seed_account('6.11', 'Transporte a ensayos y traslados', 'gasto', 'deudora', true);

-- Tarifas: precio por litro y desgaste por km. Se editan desde la app.
alter table public.app_settings
  add column fuel_magna_cents bigint not null default 2400 check (fuel_magna_cents between 1 and 100000),
  add column fuel_premium_cents bigint not null default 2600 check (fuel_premium_cents between 1 and 100000),
  add column fuel_diesel_cents bigint not null default 2700 check (fuel_diesel_cents between 1 and 100000),
  add column wear_cents_per_km bigint not null default 150 check (wear_cents_per_km between 0 and 10000);

-- ---------------------------------------------------------------------------
-- Autos y lugares
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default public.uuid_v7(),
  owner_id uuid not null references public.profiles (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  fuel public.fuel_type not null,
  km_per_liter numeric(5, 2) not null check (km_per_liter between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table public.places (
  id uuid primary key default public.uuid_v7(),
  name text not null check (length(btrim(name)) between 1 and 60),
  address text not null check (length(btrim(address)) between 3 and 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- ---------------------------------------------------------------------------
-- Viajes y pagos
-- ---------------------------------------------------------------------------
create table public.trips (
  event_id uuid primary key references public.events (id),
  origin_name text not null,
  origin_address text,
  dest_name text not null,
  dest_address text,
  purpose public.trip_purpose not null,
  round_trip boolean not null default true,
  -- Distancia de un sentido, en metros, y tiempo con tráfico en segundos.
  distance_m integer not null check (distance_m between 1 and 5000000),
  duration_s integer check (duration_s >= 0),
  -- Cuánto más se gasta de gasolina por el tráfico (0 a 50 %).
  traffic_pct integer not null default 0 check (traffic_pct between 0 and 50),
  wear_cents_per_km bigint not null check (wear_cents_per_km >= 0),
  sharers uuid[] not null check (cardinality(sharers) >= 1),
  total_cents bigint not null check (total_cents > 0),
  note text
);

create table public.trip_cars (
  id uuid primary key default public.uuid_v7(),
  event_id uuid not null references public.trips (event_id),
  vehicle_id uuid not null references public.vehicles (id),
  owner_id uuid not null references public.profiles (id),
  riders uuid[] not null default '{}',
  fuel public.fuel_type not null,
  km_per_liter numeric(5, 2) not null,
  price_per_liter_cents bigint not null check (price_per_liter_cents > 0),
  fuel_cents bigint not null check (fuel_cents >= 0),
  wear_cents bigint not null check (wear_cents >= 0),
  toll_cents bigint not null default 0 check (toll_cents >= 0),
  toll_paid_by uuid references public.profiles (id),
  check (toll_cents = 0 or toll_paid_by is not null),
  unique (event_id, vehicle_id)
);
create index trip_cars_event on public.trip_cars (event_id);

create table public.transport_payments (
  event_id uuid primary key references public.events (id),
  from_member uuid not null references public.profiles (id),
  to_member uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  check (from_member <> to_member)
);

do $$
declare
  t text;
begin
  foreach t in array array['vehicles', 'places', 'trips', 'trip_cars', 'transport_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_active_member()))',
      t || '_lectura', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Altas y tarifas (cualquier integrante activo)
-- ---------------------------------------------------------------------------
create or replace function public.save_vehicle(
  p_id uuid, p_owner uuid, p_name text, p_fuel public.fuel_type, p_km_per_liter numeric,
  p_active boolean default true
)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vehicles;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Ponle nombre al auto' using errcode = 'P0001';
  end if;
  if p_km_per_liter is null or p_km_per_liter < 1 or p_km_per_liter > 60 then
    raise exception 'El rendimiento debe estar entre 1 y 60 km por litro' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner and activo) then
    raise exception 'Elige de quién es el auto' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.vehicles (owner_id, name, fuel, km_per_liter, active, created_by)
    values (p_owner, btrim(p_name), p_fuel, round(p_km_per_liter, 2), coalesce(p_active, true), v_uid)
    returning * into v;
  else
    update public.vehicles
    set owner_id = p_owner, name = btrim(p_name), fuel = p_fuel,
        km_per_liter = round(p_km_per_liter, 2), active = coalesce(p_active, true)
    where id = p_id
    returning * into v;
    if v.id is null then
      raise exception 'Ese auto no existe' using errcode = 'P0001';
    end if;
  end if;
  perform public.log_audit('vehicle.save', 'vehicles', v.id::text, to_jsonb(v), null);
  return v;
end;
$$;

create or replace function public.save_place(
  p_id uuid, p_name text, p_address text, p_active boolean default true
)
returns public.places
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.places;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_address, ''))) < 3 then
    raise exception 'Pon el nombre del lugar y su dirección' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.places (name, address, active, created_by)
    values (btrim(p_name), btrim(p_address), coalesce(p_active, true), (select auth.uid()))
    returning * into v;
  else
    update public.places
    set name = btrim(p_name), address = btrim(p_address), active = coalesce(p_active, true)
    where id = p_id
    returning * into v;
    if v.id is null then
      raise exception 'Ese lugar no existe' using errcode = 'P0001';
    end if;
  end if;
  return v;
end;
$$;

create or replace function public.set_transport_rates(
  p_magna_cents bigint, p_premium_cents bigint, p_diesel_cents bigint, p_wear_cents_per_km bigint
)
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
  if least(p_magna_cents, p_premium_cents, p_diesel_cents) < 1
     or greatest(p_magna_cents, p_premium_cents, p_diesel_cents) > 100000
     or p_wear_cents_per_km < 0 or p_wear_cents_per_km > 10000 then
    raise exception 'Revisa las tarifas' using errcode = 'P0001';
  end if;
  update public.app_settings
  set fuel_magna_cents = p_magna_cents, fuel_premium_cents = p_premium_cents,
      fuel_diesel_cents = p_diesel_cents, wear_cents_per_km = p_wear_cents_per_km,
      updated_at = now(), updated_by = (select auth.uid())
  where id
  returning * into v;
  perform public.log_audit('transport.rates', 'app_settings', 'true',
    jsonb_build_object('magna', p_magna_cents, 'premium', p_premium_cents, 'diesel', p_diesel_cents,
                       'wear_per_km', p_wear_cents_per_km), null);
  return v;
end;
$$;

-- Cuenta "Transporte entre integrantes" de alguien; se crea la primera vez.
create or replace function public.transport_account(p_member uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_suffix text;
  v_name text;
begin
  select id into v_id from public.accounts where member_id = p_member and member_kind = 'transporte';
  if v_id is not null then
    return v_id;
  end if;
  perform public.ensure_member_accounts(p_member);
  select split_part(code, '.', 3) into v_suffix
  from public.accounts where member_id = p_member and member_kind = 'por_regresar';
  select display_name into v_name from public.profiles where id = p_member;
  insert into public.accounts (code, name, type, nature, parent_id, member_id, member_kind)
  values ('1.6.' || v_suffix, 'Transporte: cuenta de ' || v_name, 'activo', 'deudora',
          public.account_id('1.6'), p_member, 'transporte')
  on conflict (member_id, member_kind) do nothing;
  select id into v_id from public.accounts where member_id = p_member and member_kind = 'transporte';
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detalle de un viaje o de un pago (lo llama submit_event)
-- ---------------------------------------------------------------------------
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
  if jsonb_array_length(coalesce(p_payload -> 'cars', '[]'::jsonb)) = 0 then
    raise exception 'Agrega al menos un auto' using errcode = 'P0001';
  end if;

  insert into public.trips
    (event_id, origin_name, origin_address, dest_name, dest_address, purpose, round_trip, distance_m,
     duration_s, traffic_pct, wear_cents_per_km, sharers, total_cents, note)
  values
    (p_event, btrim(p_payload ->> 'origin_name'), nullif(btrim(p_payload ->> 'origin_address'), ''),
     btrim(p_payload ->> 'dest_name'), nullif(btrim(p_payload ->> 'dest_address'), ''),
     (p_payload ->> 'purpose')::public.trip_purpose, v_round, v_distance,
     nullif(p_payload ->> 'duration_s', '')::integer, v_traffic, v_wear, v_sharers, 1,
     nullif(btrim(p_payload ->> 'note'), ''));

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

-- ---------------------------------------------------------------------------
-- Contabilidad
-- ---------------------------------------------------------------------------
create or replace function public.post_viaje(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trips;
  v_is_show boolean := false;
  v_fuel_cents bigint;
  v_toll_cents bigint;
  v_lines jsonb := '[]'::jsonb;
  v_n integer;
  v_base bigint;
  v_extra integer;
  m record;
  v_net bigint;
begin
  select * into t from public.trips where event_id = e.id;
  if e.project_id is not null then
    select pt.is_show into v_is_show
    from public.projects p join public.project_types pt on pt.id = p.type_id
    where p.id = e.project_id;
  end if;
  select sum(fuel_cents + wear_cents), sum(toll_cents) into v_fuel_cents, v_toll_cents
  from public.trip_cars where event_id = e.id;

  -- Gasto: en shows va a costos de show (gasolina y casetas aparte); si no, a transporte general.
  if v_is_show then
    if v_fuel_cents > 0 then
      v_lines := v_lines || public.jl(public.account_id('5.3.01'), v_fuel_cents, 0, null, e.project_id);
    end if;
    if v_toll_cents > 0 then
      v_lines := v_lines || public.jl(public.account_id('5.3.02'), v_toll_cents, 0, null, e.project_id);
    end if;
  else
    v_lines := v_lines || public.jl(public.account_id('6.11'), t.total_cents, 0, null, e.project_id);
  end if;

  -- Partes iguales; los centavos que sobran se van a los primeros de la lista.
  v_n := cardinality(t.sharers);
  v_base := t.total_cents / v_n;
  v_extra := (t.total_cents % v_n)::integer;

  for m in
    with share as (
      select s.member, v_base + case when s.pos <= v_extra then 1 else 0 end as cents
      from unnest(t.sharers) with ordinality as s(member, pos)
    ),
    provided as (
      select member, sum(cents) as cents from (
        select owner_id as member, fuel_cents + wear_cents as cents from public.trip_cars where event_id = e.id
        union all
        select toll_paid_by, toll_cents from public.trip_cars where event_id = e.id and toll_cents > 0
      ) x group by member
    )
    select coalesce(s.member, p.member) as member,
           coalesce(s.cents, 0)::bigint as share, coalesce(p.cents, 0)::bigint as provided
    from share s full join provided p on p.member = s.member
    order by 1
  loop
    if m.share > 0 then
      v_lines := v_lines || public.jl(public.member_account(m.member, 'aportaciones'), 0, m.share,
                                      m.member, e.project_id);
    end if;
    v_net := m.share - m.provided;
    if v_net > 0 then
      v_lines := v_lines || public.jl(public.transport_account(m.member), v_net, 0, m.member, e.project_id);
    elsif v_net < 0 then
      v_lines := v_lines || public.jl(public.transport_account(m.member), 0, -v_net, m.member, e.project_id);
    end if;
  end loop;

  return public.post_entry(p_date, p_period,
    'Viaje: ' || t.origin_name || ' → ' || t.dest_name
      || case when t.round_trip then ' (ida y vuelta)' else '' end,
    e.id, v_lines);
end;
$$;

create or replace function public.post_pago_transporte(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.transport_payments;
begin
  select * into p from public.transport_payments where event_id = e.id;
  return public.post_entry(p_date, p_period,
    'Pago de transporte entre integrantes', e.id,
    jsonb_build_array(
      public.jl(public.transport_account(p.to_member), p.amount_cents, 0, p.to_member, null),
      public.jl(public.transport_account(p.from_member), 0, p.amount_cents, p.from_member, null)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
-- Saldo de transporte de cada quien: positivo = debe, negativo = le deben.
create view public.v_transport_balances with (security_invoker = true) as
select p.id as member_id, p.display_name, p.emoji, p.activo,
       coalesce((
         select sum(l.debit_cents - l.credit_cents)
         from public.accounts a join public.journal_lines l on l.account_id = a.id
         where a.member_id = p.id and a.member_kind = 'transporte'
       ), 0)::bigint as balance_cents
from public.profiles p;

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

revoke all on public.v_transport_balances, public.v_trips from anon, authenticated;
grant select on public.v_transport_balances, public.v_trips to authenticated;
grant execute on function
  public.save_vehicle(uuid, uuid, text, public.fuel_type, numeric, boolean),
  public.save_place(uuid, text, text, boolean),
  public.set_transport_rates(bigint, bigint, bigint, bigint)
to authenticated;

-- ---------------------------------------------------------------------------
-- Los viajes y pagos de transporte entran al registro general de capturas
-- ---------------------------------------------------------------------------
create or replace function public.post_event(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  v_tz text;
  v_date date;
  v_period uuid;
  v_moved boolean;
  v_entry uuid;
begin
  select * into e from public.events where id = p_event for update;
  if e.journal_entry_id is not null then
    return e.journal_entry_id;
  end if;
  select timezone into v_tz from public.app_settings where id;
  select o_date, o_period, o_moved into v_date, v_period, v_moved
  from public.resolve_accounting_date((e.captured_at at time zone v_tz)::date);

  v_entry := case e.type
    when 'gasto' then public.post_gasto(e, v_date, v_period)
    when 'ingreso' then public.post_ingreso(e, v_date, v_period)
    when 'entrega_efectivo' then public.post_entrega(e, v_date, v_period)
    when 'pago_proveedor' then public.post_pago_proveedor(e, v_date, v_period)
    when 'venta_merch' then public.post_venta(e, v_date, v_period)
    when 'compra_merch' then public.post_compra(e, v_date, v_period)
    when 'salida_merch' then public.post_ajuste_stock(e, v_date, v_period)
    when 'ajuste_inventario' then public.post_ajuste_stock(e, v_date, v_period)
    when 'cierre_show' then public.post_cierre_show(e, v_date, v_period)
    when 'anticipo_show' then public.post_anticipo_show(e, v_date, v_period)
    when 'cobro_pendiente' then public.post_cobro_pendiente(e, v_date, v_period)
    when 'viaje' then public.post_viaje(e, v_date, v_period)
    when 'pago_transporte' then public.post_pago_transporte(e, v_date, v_period)
    else public.post_fondo(e, v_date, v_period)
  end;

  update public.events
  set journal_entry_id = v_entry, status = 'registrado',
      note = case when v_moved
                  then 'Capturado en un mes ya cerrado: se registró con fecha ' || v_date else note end
  where id = p_event;

  if v_moved then
    insert into public.audit_log (actor, action, entity, entity_id, payload)
    values ((select auth.uid()), 'event.periodo_cerrado', 'events', p_event::text,
            jsonb_build_object('captured_at', e.captured_at, 'fecha_registro', v_date));
  end if;
  return v_entry;
end;
$$;

create or replace function public.submit_event(
  p_client_id uuid, p_type public.event_type, p_payload jsonb, p_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_contador boolean := public.is_contador();
  v_existing public.events;
  v_event uuid;
  v_amount bigint;
  v_project uuid := nullif(p_payload ->> 'project_id', '')::uuid;
  v_status public.event_status := 'registrado';
  v_captured timestamptz := coalesce(p_captured_at, now());
  c public.categories;
  v_paid public.paid_with;
  v_pref public.settlement_pref;
  v_place public.money_place;
  v_holder uuid;
  v_member uuid;
  v_to_kind public.transfer_party;
  v_from_kind public.transfer_party;
  v_to_member uuid;
  v_fund public.fund_kind;
  v_dir public.reclass_direction;
  v_merch boolean;
  v_show uuid := nullif(p_payload ->> 'show_id', '')::uuid;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if p_client_id is null or p_payload is null then
    raise exception 'Faltan datos del registro' using errcode = 'P0001';
  end if;

  select * into v_existing from public.events where client_id = p_client_id;
  if found then
    if v_existing.created_by <> v_uid then
      raise exception 'Ese registro pertenece a otro usuario' using errcode = '42501';
    end if;
    return public.event_result(v_existing.id, true);
  end if;

  if v_captured > now() + interval '10 minutes' then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;
  -- Eventos sin un monto único: merch y el cierre de show.
  v_merch := p_type in ('venta_merch', 'compra_merch', 'salida_merch', 'ajuste_inventario', 'cierre_show',
                        'viaje');
  if not v_merch then
    v_amount := (p_payload ->> 'amount_cents')::bigint;
    if v_amount is null or v_amount <= 0 or v_amount > 100000000000 then
      raise exception 'El monto no es válido' using errcode = 'P0001';
    end if;
  end if;
  -- Show: si viene, manda su gira o proyecto. Si no viene y el proyecto tiene un
  -- solo show vigente, la captura se le asigna sola.
  if v_show is not null then
    select project_id into v_project from public.shows where id = v_show;
    if v_project is null then
      raise exception 'Ese show no existe' using errcode = 'P0001';
    end if;
  elsif v_project is not null then
    if not exists (select 1 from public.projects where id = v_project) then
      raise exception 'Ese proyecto no existe' using errcode = 'P0001';
    end if;
    if (select count(*) from public.shows where project_id = v_project and status <> 'cancelado') = 1 then
      select id into v_show from public.shows where project_id = v_project and status <> 'cancelado';
    end if;
  end if;

  -- Entregas: definir quién confirma antes de crear el evento.
  if p_type = 'entrega_efectivo' then
    v_to_kind := (p_payload ->> 'to_kind')::public.transfer_party;
    v_from_kind := coalesce(p_payload ->> 'from_kind', 'integrante')::public.transfer_party;
    v_to_member := nullif(p_payload ->> 'to_member', '')::uuid;
    if v_from_kind = 'banco' or (v_from_kind = 'caja' and not v_contador) then
      raise exception 'Solo el contador mueve dinero desde la caja' using errcode = '42501';
    end if;
    if v_to_kind = 'integrante' then
      if v_to_member is null or not exists (select 1 from public.profiles where id = v_to_member and activo) then
        raise exception 'Elige a quién le pasaste el efectivo' using errcode = 'P0001';
      end if;
      if v_from_kind = 'integrante' and v_to_member = v_uid then
        raise exception 'No puedes pasarte efectivo a ti mismo' using errcode = 'P0001';
      end if;
      v_status := 'pendiente_confirmacion';
    else
      v_to_member := null;
      if v_from_kind = v_to_kind then
        raise exception 'El origen y el destino son el mismo' using errcode = 'P0001';
      end if;
      -- Caja y banco los confirma el contador; si él mismo captura, cuenta de inmediato.
      v_status := case when v_contador then 'registrado' else 'pendiente_confirmacion' end;
    end if;
  end if;

  begin
    insert into public.events (client_id, type, captured_at, device_info, project_id, show_id, status, created_by)
    values (p_client_id, p_type, v_captured, left(p_payload ->> 'device', 300), v_project, v_show, v_status, v_uid)
    returning id into v_event;
  exception when unique_violation then
    -- Dos envíos simultáneos del mismo registro: gana el primero.
    select * into v_existing from public.events where client_id = p_client_id;
    return public.event_result(v_existing.id, true);
  end;

  case p_type
    when 'gasto' then
      select * into c from public.categories
      where id = (p_payload ->> 'category_id')::uuid and kind = 'gasto' and active;
      if c.id is null then
        raise exception 'Elige una categoría' using errcode = 'P0001';
      end if;
      if c.visible_to = 'contador' and not v_contador then
        raise exception 'Esa categoría solo la usa el contador' using errcode = '42501';
      end if;
      v_paid := (p_payload ->> 'paid_with')::public.paid_with;
      if v_paid = 'caja' and not v_contador then
        raise exception 'Solo el contador paga desde la caja' using errcode = '42501';
      end if;
      v_pref := nullif(p_payload ->> 'settlement_pref', '')::public.settlement_pref;
      if v_paid = 'mi_dinero' and v_pref is null then
        raise exception 'Dinos qué hacemos con lo que pusiste' using errcode = 'P0001';
      end if;
      insert into public.expense_details
        (event_id, category_id, amount_cents, paid_with, payer_member_id, settlement_pref,
         payee_contact_id, description)
      values (v_event, c.id, v_amount, v_paid, v_uid,
              case when v_paid = 'mi_dinero' then v_pref end,
              nullif(p_payload ->> 'payee_contact_id', '')::uuid,
              nullif(btrim(p_payload ->> 'description'), ''));

    when 'ingreso' then
      select * into c from public.categories
      where id = (p_payload ->> 'category_id')::uuid and kind = 'ingreso' and active;
      if c.id is null then
        raise exception 'Elige de qué fue el cobro' using errcode = 'P0001';
      end if;
      v_place := (p_payload ->> 'destination')::public.money_place;
      insert into public.income_details
        (event_id, category_id, account_id, amount_cents, destination, holder_member_id, description)
      values (v_event, c.id, c.account_general_id, v_amount, v_place,
              case when v_place = 'efectivo_integrante' then v_uid end,
              nullif(btrim(p_payload ->> 'description'), ''));

    when 'entrega_efectivo' then
      insert into public.cash_transfers
        (event_id, from_kind, from_member, to_kind, to_member, amount_cents, note,
         confirmed_by, confirmed_at)
      values (v_event, v_from_kind, case when v_from_kind = 'integrante' then v_uid end,
              v_to_kind, v_to_member, v_amount, nullif(btrim(p_payload ->> 'note'), ''),
              case when v_status = 'registrado' then v_uid end,
              case when v_status = 'registrado' then now() end);

    when 'puse_dinero' then
      v_fund := (p_payload ->> 'kind')::public.fund_kind;
      if v_fund not in ('prestamo', 'aportacion') then
        raise exception 'Dinos si se te regresa o es aportación' using errcode = 'P0001';
      end if;
      v_place := (p_payload ->> 'destination')::public.money_place;
      v_holder := case when v_place = 'efectivo_integrante'
                       then coalesce(nullif(p_payload ->> 'holder_member_id', '')::uuid, v_uid) end;
      if v_holder is not null and not exists (select 1 from public.profiles where id = v_holder and activo) then
        raise exception 'Ese integrante no existe' using errcode = 'P0001';
      end if;
      insert into public.fund_movements (event_id, kind, member_id, amount_cents, place, holder_member_id)
      values (v_event, v_fund, v_uid, v_amount, v_place, v_holder);

    when 'reclasificacion' then
      if not v_contador then
        raise exception 'Solo el contador reclasifica saldos' using errcode = '42501';
      end if;
      v_member := (p_payload ->> 'member_id')::uuid;
      v_dir := (p_payload ->> 'direction')::public.reclass_direction;
      if -public.account_balance(public.member_account(
           v_member, case when v_dir = 'a_aportacion' then 'por_regresar' else 'aportaciones' end
             ::public.member_account_kind)) < v_amount then
        raise exception 'El monto es mayor que el saldo a reclasificar' using errcode = 'P0001';
      end if;
      insert into public.fund_movements (event_id, kind, member_id, amount_cents, direction)
      values (v_event, 'reclasificacion', v_member, v_amount, v_dir);

    when 'regreso_dinero' then
      v_member := (p_payload ->> 'member_id')::uuid;
      v_place := (p_payload ->> 'origin')::public.money_place;
      if v_place <> 'efectivo_integrante' and not v_contador then
        raise exception 'Solo el contador regresa dinero desde la caja o la cuenta' using errcode = '42501';
      end if;
      v_holder := case when v_place = 'efectivo_integrante'
                       then case when v_contador
                                 then coalesce(nullif(p_payload ->> 'holder_member_id', '')::uuid, v_uid)
                                 else v_uid end end;
      if -public.account_balance(public.member_account(v_member, 'por_regresar')) < v_amount then
        raise exception 'El monto es mayor que lo que se le debe' using errcode = 'P0001';
      end if;
      insert into public.fund_movements (event_id, kind, member_id, amount_cents, place, holder_member_id)
      values (v_event, 'regreso', v_member, v_amount, v_place, v_holder);

    when 'pago_proveedor' then
      v_place := (p_payload ->> 'origin')::public.money_place;
      if v_place <> 'efectivo_integrante' and not v_contador then
        raise exception 'Solo el contador paga desde la caja o la cuenta' using errcode = '42501';
      end if;
      if -public.account_balance(public.account_id('2.2')) < v_amount then
        raise exception 'El monto es mayor que lo pendiente de pagar' using errcode = 'P0001';
      end if;
      insert into public.supplier_payments (event_id, contact_id, amount_cents, origin, holder_member_id, description)
      values (v_event, nullif(p_payload ->> 'contact_id', '')::uuid, v_amount, v_place,
              case when v_place = 'efectivo_integrante' then v_uid end,
              nullif(btrim(p_payload ->> 'description'), ''));

    when 'viaje', 'pago_transporte' then
      perform public.insert_transport_detail(v_event, p_type, p_payload, v_uid, v_contador, v_amount);

    when 'cierre_show', 'anticipo_show', 'cobro_pendiente' then
      perform public.insert_show_detail(v_event, p_type, p_payload, v_uid, v_contador, v_amount);

    else
      -- Merch: venta, compra, salida (regalo/merma) y ajuste por conteo.
      perform public.insert_merch_detail(v_event, p_type, p_payload, v_uid, v_contador);
  end case;

  if v_status = 'registrado' then
    perform public.post_event(v_event);
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, payload, device)
  values (v_uid, 'event.submit', 'events', v_event::text,
          jsonb_build_object('type', p_type, 'payload', p_payload - 'device'),
          left(p_payload ->> 'device', 300));

  return public.event_result(v_event, false);
end;
$$;

-- El feed incluye viajes y pagos de transporte.
create or replace view public.v_event_feed with (security_invoker = true) as
select e.id, e.client_id, e.type, e.status, e.captured_at, e.created_at, e.created_by,
       e.project_id, e.note, e.void_reason,
       coalesce(x.amount_cents, i.amount_cents, t.amount_cents, f.amount_cents, s.amount_cents,
                sd.total_cents, pd.total_cents, sa.cost_cents, st.income_cents, adv.amount_cents,
                rc.amount_cents, tr.total_cents, tp.amount_cents) as amount_cents,
       c.name as category_name, c.emoji as category_emoji,
       x.paid_with, x.settlement_pref,
       coalesce(i.destination, f.place, s.origin) as place,
       t.from_kind, t.from_member, t.to_kind, t.to_member,
       f.kind as fund_kind, f.member_id as fund_member, f.direction,
       coalesce(x.description, i.description, t.note, s.description, pd.description, sa.note, sd.channel_note)
         as description,
       coalesce(sd.pieces, pd.pieces, abs(sa.qty)) as pieces,
       sa.kind as stock_kind,
       e.show_id,
       sh.name as show_name,
       coalesce(st.pending, false) as show_pending,
       tr.origin_name as trip_origin, tr.dest_name as trip_dest, tr.purpose as trip_purpose,
       tp.from_member as pay_from, tp.to_member as pay_to
from public.events e
left join public.expense_details x on x.event_id = e.id
left join public.income_details i on i.event_id = e.id
left join public.cash_transfers t on t.event_id = e.id
left join public.fund_movements f on f.event_id = e.id
left join public.supplier_payments s on s.event_id = e.id
left join public.sale_details sd on sd.event_id = e.id
left join public.purchase_details pd on pd.event_id = e.id
left join public.stock_adjustments sa on sa.event_id = e.id
left join public.show_settlements st on st.event_id = e.id
left join public.show_advances adv on adv.event_id = e.id
left join public.receivable_collections rc on rc.event_id = e.id
left join public.shows sh on sh.id = e.show_id
left join public.trips tr on tr.event_id = e.id
left join public.transport_payments tp on tp.event_id = e.id
left join public.categories c on c.id = coalesce(x.category_id, i.category_id);

revoke all on public.v_event_feed from anon, authenticated;
grant select on public.v_event_feed to authenticated;

-- Permisos: nada es ejecutable por el cliente salvo esta lista. (Incluye las
-- consultas de reportes de la Fase 5a, que habían quedado abiertas a "public".)
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_contador(), public.is_active_member(), public.uuid_v7(),
  public.log_audit(text, text, text, jsonb, text),
  public.create_project(text, text, date, date, bigint, text),
  public.set_active_context(uuid, uuid),
  public.submit_event(uuid, public.event_type, jsonb, timestamptz),
  public.confirm_cash_transfer(uuid, boolean),
  public.void_event(uuid, text),
  public.save_product(jsonb),
  public.set_product_photo(uuid, text),
  public.save_show(jsonb),
  public.set_show_cancelled(uuid, boolean),
  public.save_ticket_platform(jsonb),
  public.report_account_totals(date, date, uuid, uuid),
  public.report_cash_flow(date, date, uuid),
  public.report_merch(date, date),
  public.report_ledger(uuid, date, date),
  public.save_vehicle(uuid, uuid, text, public.fuel_type, numeric, boolean),
  public.save_place(uuid, text, text, boolean),
  public.set_transport_rates(bigint, bigint, bigint, bigint)
to authenticated;

alter publication supabase_realtime add table public.vehicles;

-- Ajustes de merch pedidos por Diego:
--   1. Saldo inicial de inventario (lo que ya había), separado de una compra.
--   2. Foto por producto, que cualquier integrante puede subir.
--   3. Vista de movimientos (kardex) para revisar cómo se asigna el costo.

-- ---------------------------------------------------------------------------
-- 1. Saldo inicial: entra al inventario contra 3.3 (fondo acumulado), sin pago.
-- ---------------------------------------------------------------------------
alter table public.purchase_details
  alter column paid_with drop not null,
  add column is_opening boolean not null default false,
  add constraint purchase_details_opening_check check (is_opening = (paid_with is null));

create or replace function public.insert_merch_detail(
  p_event uuid, p_type public.event_type, p_payload jsonb, p_uid uuid, p_contador boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
  v public.product_variants;
  v_lines jsonb := coalesce(p_payload -> 'lines', '[]'::jsonb);
  v_qty integer;
  v_price bigint;
  v_gift boolean;
  v_cost bigint;
  v_total bigint := 0;
  v_pieces integer := 0;
  v_collector uuid;
  v_paid public.paid_with;
  v_pref public.settlement_pref;
  v_kind public.inventory_kind;
  v_counted integer;
  v_opening boolean := coalesce((p_payload ->> 'opening')::boolean, false);
begin
  if p_type in ('venta_merch', 'compra_merch') then
    if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'Agrega al menos un producto' using errcode = 'P0001';
    end if;
    if jsonb_array_length(v_lines) > 100 then
      raise exception 'Son demasiados productos en un solo registro' using errcode = 'P0001';
    end if;
  end if;

  if p_type = 'venta_merch' then
    v_collector := coalesce(nullif(p_payload ->> 'collected_by', '')::uuid, p_uid);
    if not exists (select 1 from public.profiles where id = v_collector and activo) then
      raise exception 'Elige quién cobró' using errcode = 'P0001';
    end if;

    for l in select * from jsonb_array_elements(v_lines) loop
      select pv.* into v from public.product_variants pv where pv.id = (l ->> 'variant_id')::uuid;
      v_qty := (l ->> 'qty')::integer;
      if v.id is null or v_qty is null or v_qty <= 0 or v_qty > 1000 then
        raise exception 'Hay un producto o una cantidad que no es válida' using errcode = 'P0001';
      end if;
      v_gift := coalesce((l ->> 'is_gift')::boolean, false);
      -- El precio es el que se cobró en el momento (puede venir de la caché offline).
      v_price := case when v_gift then 0 else coalesce((l ->> 'unit_price_cents')::bigint, v.price_cents) end;
      if v_price < 0 or (not v_gift and v_price = 0) then
        raise exception 'Un producto sin precio se registra como regalo' using errcode = 'P0001';
      end if;
      v_cost := public.apply_stock(p_event, v.id, -v_qty, null,
                                   case when v_gift then 'regalo' else 'venta' end::public.inventory_kind);
      insert into public.sale_lines (event_id, variant_id, qty, unit_price_cents, is_gift, unit_cost_cents, cost_cents)
      values (p_event, v.id, v_qty, v_price, v_gift, round(v_cost::numeric / v_qty)::bigint, v_cost);
      v_total := v_total + v_price * v_qty;
      v_pieces := v_pieces + v_qty;
    end loop;

    insert into public.sale_details (event_id, channel, payment_method, collected_by, total_cents, pieces)
    values (p_event, coalesce(p_payload ->> 'channel', 'otro')::public.sale_channel,
            coalesce(p_payload ->> 'payment_method', 'efectivo')::public.payment_method,
            v_collector, v_total, v_pieces);

  elsif p_type = 'compra_merch' then
    -- Saldo inicial: lo que la banda ya tenía antes de usar la app. No sale dinero.
    if v_opening and not p_contador then
      raise exception 'Solo el contador registra el saldo inicial' using errcode = '42501';
    end if;
    v_paid := case when v_opening then null else (p_payload ->> 'paid_with')::public.paid_with end;
    if not v_opening and v_paid is null then
      raise exception 'Dinos con qué se pagó' using errcode = 'P0001';
    end if;
    if v_paid = 'caja' and not p_contador then
      raise exception 'Solo el contador paga desde la caja' using errcode = '42501';
    end if;
    v_pref := nullif(p_payload ->> 'settlement_pref', '')::public.settlement_pref;
    if v_paid = 'mi_dinero' and v_pref is null then
      raise exception 'Dinos qué hacemos con lo que pusiste' using errcode = 'P0001';
    end if;

    for l in select * from jsonb_array_elements(v_lines) loop
      select pv.* into v from public.product_variants pv where pv.id = (l ->> 'variant_id')::uuid;
      v_qty := (l ->> 'qty')::integer;
      v_price := (l ->> 'unit_cost_cents')::bigint;
      if v.id is null or v_qty is null or v_qty <= 0 or v_qty > 100000 or v_price is null or v_price < 0 then
        raise exception 'Hay un producto, una cantidad o un costo que no es válido' using errcode = 'P0001';
      end if;
      perform public.apply_stock(p_event, v.id, v_qty, v_price, 'compra');
      insert into public.purchase_lines (event_id, variant_id, qty, unit_cost_cents)
      values (p_event, v.id, v_qty, v_price);
      v_total := v_total + v_price * v_qty;
      v_pieces := v_pieces + v_qty;
    end loop;

    insert into public.purchase_details
      (event_id, paid_with, is_opening, payer_member_id, settlement_pref, supplier_contact_id, total_cents, pieces, description)
    values (p_event, v_paid, v_opening, p_uid, case when v_paid = 'mi_dinero' then v_pref end,
            nullif(p_payload ->> 'supplier_contact_id', '')::uuid, v_total, v_pieces,
            nullif(btrim(p_payload ->> 'description'), ''));

  elsif p_type = 'salida_merch' then
    v_kind := (p_payload ->> 'kind')::public.inventory_kind;
    if v_kind not in ('regalo', 'merma') then
      raise exception 'Dinos si fue regalo o merma' using errcode = 'P0001';
    end if;
    if v_kind = 'merma' and not p_contador then
      raise exception 'Solo el contador registra mermas' using errcode = '42501';
    end if;
    v_qty := (p_payload ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      raise exception 'La cantidad no es válida' using errcode = 'P0001';
    end if;
    v_cost := public.apply_stock(p_event, (p_payload ->> 'variant_id')::uuid, -v_qty, null, v_kind);
    insert into public.stock_adjustments (event_id, kind, variant_id, qty, cost_cents, note)
    values (p_event, v_kind, (p_payload ->> 'variant_id')::uuid, v_qty, v_cost,
            nullif(btrim(p_payload ->> 'note'), ''));

  else -- ajuste_inventario
    if not p_contador then
      raise exception 'Solo el contador ajusta el inventario' using errcode = '42501';
    end if;
    select pv.* into v from public.product_variants pv
    where pv.id = (p_payload ->> 'variant_id')::uuid for update;
    v_counted := (p_payload ->> 'counted_qty')::integer;
    if v.id is null or v_counted is null or v_counted < 0 then
      raise exception 'El conteo no es válido' using errcode = 'P0001';
    end if;
    v_qty := v_counted - v.stock_qty;
    if v_qty = 0 then
      raise exception 'El conteo coincide con el sistema: no hay nada que ajustar' using errcode = 'P0001';
    end if;
    v_cost := public.apply_stock(p_event, v.id, v_qty, v.avg_cost_cents, 'ajuste');
    insert into public.stock_adjustments (event_id, kind, variant_id, qty, counted_qty, cost_cents, note)
    values (p_event, 'ajuste', v.id, v_qty, v_counted, v_cost, nullif(btrim(p_payload ->> 'note'), ''));
  end if;
end;
$$;

create or replace function public.post_compra(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.purchase_details;
  l record;
  v_lines jsonb := '[]'::jsonb;
  v_credit uuid;
begin
  select * into d from public.purchase_details where event_id = e.id;
  if d.total_cents = 0 then
    return null; -- entrada sin costo: solo mueve existencias
  end if;

  for l in
    select pl.*, p.inventory_account_id
    from public.purchase_lines pl
    join public.product_variants pv on pv.id = pl.variant_id
    join public.products p on p.id = pv.product_id
    where pl.event_id = e.id and pl.unit_cost_cents > 0 order by pl.id
  loop
    v_lines := v_lines || public.jlv(l.inventory_account_id, l.qty * l.unit_cost_cents, 0,
                                     l.variant_id, d.payer_member_id, e.project_id);
  end loop;

  v_credit := case
    when d.is_opening then public.account_id('3.3')
    when d.paid_with = 'efectivo_banda' then public.member_account(d.payer_member_id, 'efectivo')
    when d.paid_with = 'caja' then public.account_id('1.1.01')
    when d.paid_with = 'cuenta_banda' then public.account_id('1.2.01')
    when d.paid_with = 'pendiente' then public.account_id('2.2')
    else public.member_account(
      d.payer_member_id,
      case when d.settlement_pref = 'aportacion' then 'aportaciones' else 'por_regresar' end
        ::public.member_account_kind)
  end;
  v_lines := v_lines || public.jl(v_credit, 0, d.total_cents,
                                  case when d.is_opening then null else d.payer_member_id end, e.project_id);

  return public.post_entry(p_date, p_period,
    case when d.is_opening then 'Saldo inicial de merch (' else 'Compra de merch (' end
      || d.pieces || ' pzas)' || coalesce(' — ' || d.description, ''), e.id, v_lines);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fotos de producto: bucket privado; cualquier integrante sube y ve.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy productos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'productos' and public.is_active_member());

create policy productos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and public.is_active_member());

create or replace function public.set_product_photo(p_product_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if p_path is null or p_path not like p_product_id::text || '/%' then
    raise exception 'La foto no corresponde a ese producto' using errcode = 'P0001';
  end if;
  update public.products set photo_path = p_path where id = p_product_id;
  if not found then
    raise exception 'Ese producto no existe' using errcode = 'P0001';
  end if;
  perform public.log_audit('product.photo', 'products', p_product_id::text, jsonb_build_object('path', p_path));
end;
$$;

-- La foto se agrega al final de la vista de inventario.
create or replace view public.v_inventory with (security_invoker = true) as
select pv.id as variant_id, p.id as product_id, p.name as product_name, p.emoji, p.category,
       pv.label, pv.sku, pv.price_cents, pv.stock_qty, pv.avg_cost_cents, pv.stock_value_cents,
       pv.low_stock_threshold, p.active and pv.active as active, p.sort as product_sort, pv.sort as variant_sort,
       case when pv.stock_qty < 0 then 'negativo'
            when pv.stock_qty <= pv.low_stock_threshold then 'bajo' else 'ok' end as stock_status,
       p.photo_path
from public.product_variants pv
join public.products p on p.id = pv.product_id;

-- ---------------------------------------------------------------------------
-- 3. Kardex: cada movimiento de inventario con su costo y quién lo hizo.
-- ---------------------------------------------------------------------------
create view public.v_kardex with (security_invoker = true) as
select m.id as movement_id, m.variant_id, m.event_id, m.created_at, e.captured_at,
       m.kind, m.qty, m.unit_cost_cents, m.cost_cents,
       e.type as event_type, e.status as event_status, e.created_by,
       coalesce(pd.is_opening, false) as is_opening
from public.inventory_movements m
join public.events e on e.id = m.event_id
left join public.purchase_details pd on pd.event_id = m.event_id;

revoke all on public.v_inventory, public.v_kardex from anon, authenticated;
grant select on public.v_inventory, public.v_kardex to authenticated;
grant execute on function public.set_product_photo(uuid, text) to authenticated;

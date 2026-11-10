-- Fase 2 (2/2) — Merch: productos, variantes, inventario a costo promedio
-- ponderado, y los eventos de venta, compra, salida (regalo/merma) y ajuste.

create type public.merch_category as enum ('playeras', 'vinilos_cd', 'stickers', 'pines', 'canas', 'otros');
create type public.inventory_kind as enum ('compra', 'venta', 'regalo', 'merma', 'ajuste', 'anulacion');
create type public.sale_channel as enum ('show', 'bandcamp', 'tienda_web', 'otro');
create type public.payment_method as enum ('efectivo', 'transferencia');

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default public.uuid_v7(),
  name text not null unique
);
insert into public.locations (name) values ('Bodega Apnea');

create table public.products (
  id uuid primary key default public.uuid_v7(),
  category public.merch_category not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  emoji text not null default '👕',
  photo_path text,
  inventory_account_id uuid not null references public.accounts (id),
  revenue_account_id uuid not null references public.accounts (id),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table public.product_variants (
  id uuid primary key default public.uuid_v7(),
  product_id uuid not null references public.products (id),
  sku text not null unique,
  label text not null check (length(btrim(label)) between 1 and 40),
  price_cents bigint not null default 0 check (price_cents >= 0),
  -- Estado del inventario: solo lo mueven las funciones de posteo.
  stock_qty integer not null default 0,
  stock_value_cents bigint not null default 0,
  avg_cost_cents bigint not null default 0 check (avg_cost_cents >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);

alter table public.journal_lines
  add constraint journal_lines_variant_fkey foreign key (variant_id) references public.product_variants (id);

-- Bitácora de inventario: un renglón por movimiento, nunca se edita.
create table public.inventory_movements (
  id uuid primary key default public.uuid_v7(),
  event_id uuid not null references public.events (id),
  variant_id uuid not null references public.product_variants (id),
  location_id uuid not null references public.locations (id),
  qty integer not null check (qty <> 0),          -- + entra, − sale
  unit_cost_cents bigint not null,
  cost_cents bigint not null,                      -- costo total con signo (+ entra, − sale)
  kind public.inventory_kind not null,
  created_at timestamptz not null default now()
);
create index inventory_movements_event_idx on public.inventory_movements (event_id);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id);

-- ---------------------------------------------------------------------------
-- Detalle de eventos
-- ---------------------------------------------------------------------------
create table public.sale_details (
  event_id uuid primary key references public.events (id),
  channel public.sale_channel not null,
  payment_method public.payment_method not null,
  collected_by uuid not null references public.profiles (id),
  total_cents bigint not null check (total_cents >= 0),
  pieces integer not null check (pieces > 0)
);

create table public.sale_lines (
  id uuid primary key default public.uuid_v7(),
  event_id uuid not null references public.events (id),
  variant_id uuid not null references public.product_variants (id),
  qty integer not null check (qty > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  is_gift boolean not null default false,
  unit_cost_cents bigint not null,
  cost_cents bigint not null,
  check (not is_gift or unit_price_cents = 0)
);
create index sale_lines_event_idx on public.sale_lines (event_id);

create table public.purchase_details (
  event_id uuid primary key references public.events (id),
  paid_with public.paid_with not null,
  payer_member_id uuid not null references public.profiles (id),
  settlement_pref public.settlement_pref,
  supplier_contact_id uuid references public.contacts (id),
  total_cents bigint not null check (total_cents >= 0),
  pieces integer not null check (pieces > 0),
  description text,
  check ((paid_with = 'mi_dinero') = (settlement_pref is not null))
);

create table public.purchase_lines (
  id uuid primary key default public.uuid_v7(),
  event_id uuid not null references public.events (id),
  variant_id uuid not null references public.product_variants (id),
  qty integer not null check (qty > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0)
);
create index purchase_lines_event_idx on public.purchase_lines (event_id);

-- Regalo, merma o ajuste por conteo de una variante.
create table public.stock_adjustments (
  event_id uuid primary key references public.events (id),
  kind public.inventory_kind not null check (kind in ('regalo', 'merma', 'ajuste')),
  variant_id uuid not null references public.product_variants (id),
  qty integer not null check (qty <> 0),          -- regalo/merma: piezas que salen; ajuste: diferencia con signo
  counted_qty integer,
  cost_cents bigint not null,
  note text
);

create trigger inventory_movements_immutable before update or delete on public.inventory_movements
  for each row execute function public.forbid_mutation();
create trigger sale_details_immutable before update or delete on public.sale_details
  for each row execute function public.forbid_mutation();
create trigger sale_lines_immutable before update or delete on public.sale_lines
  for each row execute function public.forbid_mutation();
create trigger purchase_details_immutable before update or delete on public.purchase_details
  for each row execute function public.forbid_mutation();
create trigger purchase_lines_immutable before update or delete on public.purchase_lines
  for each row execute function public.forbid_mutation();
create trigger stock_adjustments_immutable before update or delete on public.stock_adjustments
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Inventario a costo promedio ponderado
-- ---------------------------------------------------------------------------
-- Mueve existencias de una variante y devuelve el costo total del movimiento
-- (siempre positivo). El valor del inventario se lleva en centavos exactos por
-- variante, así que diario e inventario siempre coinciden al centavo.
--   Entrada: p_qty > 0 con su costo unitario.
--   Salida:  p_qty < 0; sale a costo promedio. Si deja existencias en cero, se
--            lleva todo el valor restante (sin residuos de redondeo).
create or replace function public.apply_stock(
  p_event uuid, p_variant uuid, p_qty integer, p_unit_cost bigint, p_kind public.inventory_kind
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.product_variants;
  v_out integer;
  v_cost bigint;
  v_stock integer;
  v_value bigint;
  v_avg bigint;
begin
  select * into v from public.product_variants where id = p_variant for update;
  if v.id is null then
    raise exception 'Ese producto no existe' using errcode = 'P0001';
  end if;

  if p_qty > 0 then
    v_cost := p_qty * p_unit_cost;
    v_stock := v.stock_qty + p_qty;
    v_value := v.stock_value_cents + v_cost;
  else
    v_out := -p_qty;
    if v.stock_qty >= v_out then
      v_cost := case when v_out = v.stock_qty then v.stock_value_cents
                     else round(v.stock_value_cents::numeric * v_out / v.stock_qty)::bigint end;
    else
      -- Vende más de lo que hay (típico offline): lo que falta sale al último costo promedio.
      v_cost := case when v.stock_qty > 0 then v.stock_value_cents else 0 end
                + (v_out - greatest(v.stock_qty, 0)) * v.avg_cost_cents;
    end if;
    v_cost := greatest(v_cost, 0);
    v_stock := v.stock_qty - v_out;
    v_value := v.stock_value_cents - v_cost;
  end if;

  v_avg := case
    when v_stock > 0 and v_value >= 0 then round(v_value::numeric / v_stock)::bigint
    when p_qty > 0 then p_unit_cost
    else v.avg_cost_cents
  end;

  update public.product_variants
  set stock_qty = v_stock, stock_value_cents = v_value, avg_cost_cents = v_avg
  where id = p_variant;

  insert into public.inventory_movements (event_id, variant_id, location_id, qty, unit_cost_cents, cost_cents, kind)
  values (p_event, p_variant, (select id from public.locations order by name limit 1), p_qty,
          case when p_qty > 0 then p_unit_cost else round(v_cost::numeric / (-p_qty))::bigint end,
          case when p_qty > 0 then v_cost else -v_cost end, p_kind);

  if v_stock < 0 then
    insert into public.audit_log (actor, action, entity, entity_id, payload)
    values ((select auth.uid()), 'stock.negativo', 'product_variants', p_variant::text,
            jsonb_build_object('stock', v_stock, 'event_id', p_event));
  end if;
  return v_cost;
end;
$$;

-- Deshace los movimientos de inventario de un evento (al anular): repone al
-- costo original registrado, no al promedio actual.
create or replace function public.revert_stock(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.inventory_movements;
begin
  for m in
    select * from public.inventory_movements
    where event_id = p_event and kind <> 'anulacion' order by id
  loop
    update public.product_variants
    set stock_qty = stock_qty - m.qty,
        stock_value_cents = stock_value_cents - m.cost_cents,
        avg_cost_cents = case
          when stock_qty - m.qty > 0 and stock_value_cents - m.cost_cents >= 0
            then round((stock_value_cents - m.cost_cents)::numeric / (stock_qty - m.qty))::bigint
          else avg_cost_cents end
    where id = m.variant_id;

    insert into public.inventory_movements (event_id, variant_id, location_id, qty, unit_cost_cents, cost_cents, kind)
    values (p_event, m.variant_id, m.location_id, -m.qty, m.unit_cost_cents, -m.cost_cents, 'anulacion');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detalle de los eventos de merch (lo llama submit_event)
-- ---------------------------------------------------------------------------
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
    v_paid := (p_payload ->> 'paid_with')::public.paid_with;
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
      (event_id, paid_with, payer_member_id, settlement_pref, supplier_contact_id, total_cents, pieces, description)
    values (p_event, v_paid, p_uid, case when v_paid = 'mi_dinero' then v_pref end,
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

-- ---------------------------------------------------------------------------
-- Posteo (PRD §5.3)
-- ---------------------------------------------------------------------------
-- post_entry ahora guarda también la dimensión de variante.
create or replace function public.post_entry(
  p_date date, p_period uuid, p_description text, p_event uuid, p_lines jsonb,
  p_reverses uuid default null, p_manual boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0), coalesce(sum((l ->> 'credit')::bigint), 0)
  into v_debit, v_credit
  from jsonb_array_elements(p_lines) l;
  if v_debit <> v_credit or v_debit = 0 then
    raise exception 'El asiento no cuadra: debe % ≠ haber %', v_debit, v_credit using errcode = 'P0001';
  end if;

  insert into public.journal_entries
    (date, period_id, description, source_event_id, reverses_entry_id, is_manual, created_by)
  values (p_date, p_period, p_description, p_event, p_reverses, p_manual, (select auth.uid()))
  returning id into v_id;

  insert into public.journal_lines
    (entry_id, account_id, debit_cents, credit_cents, member_id, project_id, variant_id, memo)
  select v_id, (l ->> 'account_id')::uuid, (l ->> 'debit')::bigint, (l ->> 'credit')::bigint,
         (l ->> 'member_id')::uuid, (l ->> 'project_id')::uuid, (l ->> 'variant_id')::uuid, l ->> 'memo'
  from jsonb_array_elements(p_lines) l;

  return v_id;
end;
$$;

-- Línea de asiento con variante.
create or replace function public.jlv(
  p_account uuid, p_debit bigint, p_credit bigint, p_variant uuid, p_member uuid, p_project uuid
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public.jl(p_account, p_debit, p_credit, p_member, p_project) || jsonb_build_object('variant_id', p_variant);
$$;

-- Venta: D quien cobró o cuenta · H ingreso (precio) y D 5.1 · H inventario (costo).
-- Línea de regalo: D 7.1 · H inventario, sin ingreso.
create or replace function public.post_venta(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.sale_details;
  l record;
  v_lines jsonb := '[]'::jsonb;
begin
  select * into d from public.sale_details where event_id = e.id;
  if d.total_cents > 0 then
    v_lines := v_lines || public.jl(
      case when d.payment_method = 'efectivo' then public.member_account(d.collected_by, 'efectivo')
           else public.account_id('1.2.01') end,
      d.total_cents, 0, d.collected_by, e.project_id);
  end if;

  for l in
    select s.*, p.revenue_account_id, p.inventory_account_id
    from public.sale_lines s
    join public.product_variants pv on pv.id = s.variant_id
    join public.products p on p.id = pv.product_id
    where s.event_id = e.id order by s.id
  loop
    if not l.is_gift then
      v_lines := v_lines || public.jlv(l.revenue_account_id, 0, l.unit_price_cents * l.qty,
                                       l.variant_id, d.collected_by, e.project_id);
    end if;
    if l.cost_cents > 0 then
      v_lines := v_lines
        || public.jlv(public.account_id(case when l.is_gift then '7.1' else '5.1' end), l.cost_cents, 0,
                      l.variant_id, d.collected_by, e.project_id)
        || public.jlv(l.inventory_account_id, 0, l.cost_cents, l.variant_id, d.collected_by, e.project_id);
    end if;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    return null; -- solo regalos sin costo: no hay nada que asentar
  end if;
  return public.post_entry(p_date, p_period, 'Venta de merch (' || d.pieces || ' pzas)', e.id, v_lines);
end;
$$;

-- Compra: D inventario · H pagador.
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

  v_credit := case d.paid_with
    when 'efectivo_banda' then public.member_account(d.payer_member_id, 'efectivo')
    when 'caja' then public.account_id('1.1.01')
    when 'cuenta_banda' then public.account_id('1.2.01')
    when 'pendiente' then public.account_id('2.2')
    else public.member_account(
      d.payer_member_id,
      case when d.settlement_pref = 'aportacion' then 'aportaciones' else 'por_regresar' end
        ::public.member_account_kind)
  end;
  v_lines := v_lines || public.jl(v_credit, 0, d.total_cents, d.payer_member_id, e.project_id);

  return public.post_entry(p_date, p_period,
    'Compra de merch (' || d.pieces || ' pzas)' || coalesce(' — ' || d.description, ''), e.id, v_lines);
end;
$$;

-- Regalo: D 7.1 · H inventario. Merma: D 7.2 · H inventario.
-- Ajuste por conteo: sobrante D inventario · H 7.2; faltante, como merma.
create or replace function public.post_ajuste_stock(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.stock_adjustments;
  v_inventory uuid;
  v_other uuid;
  v_in boolean;
begin
  select * into a from public.stock_adjustments where event_id = e.id;
  if a.cost_cents = 0 then
    return null;
  end if;
  select p.inventory_account_id into v_inventory
  from public.product_variants pv join public.products p on p.id = pv.product_id
  where pv.id = a.variant_id;
  v_other := public.account_id(case when a.kind = 'regalo' then '7.1' else '7.2' end);
  v_in := a.kind = 'ajuste' and a.qty > 0;

  return public.post_entry(p_date, p_period,
    case a.kind when 'regalo' then 'Merch regalado' when 'merma' then 'Merma de merch'
                else 'Ajuste de inventario por conteo' end
      || coalesce(' — ' || a.note, ''), e.id,
    jsonb_build_array(
      public.jlv(case when v_in then v_inventory else v_other end, a.cost_cents, 0,
                 a.variant_id, e.created_by, e.project_id),
      public.jlv(case when v_in then v_other else v_inventory end, 0, a.cost_cents,
                 a.variant_id, e.created_by, e.project_id)));
end;
$$;

-- post_event: suma los tipos de merch. Un evento puede quedar registrado sin
-- asiento cuando no hay importe que asentar (p. ej. un regalo sin costo).
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

-- void_event: además de la reversa contable, repone o revierte el inventario
-- al costo original del evento.
create or replace function public.void_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e public.events;
  j public.journal_entries;
  v_hours integer;
  v_date date;
  v_period uuid;
  v_moved boolean;
  v_void uuid;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Cuéntanos por qué lo anulas' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = p_event_id for update;
  if e.id is null then
    raise exception 'Ese registro no existe' using errcode = 'P0001';
  end if;
  if e.status = 'anulado' then
    return public.event_result(e.id, true);
  end if;
  if e.status = 'rechazado' then
    raise exception 'Una entrega rechazada no se puede anular' using errcode = 'P0001';
  end if;

  if not public.is_contador() then
    select void_window_hours into v_hours from public.app_settings where id;
    if e.created_by <> v_uid then
      raise exception 'Solo puedes anular tus propios registros' using errcode = '42501';
    end if;
    if e.created_at < now() - make_interval(hours => v_hours) then
      raise exception 'Ya pasaron % horas: pídele al contador que lo anule', v_hours using errcode = '42501';
    end if;
  end if;

  if e.status = 'registrado' then
    if e.journal_entry_id is not null then
      select * into j from public.journal_entries where id = e.journal_entry_id;
      select o_date, o_period, o_moved into v_date, v_period, v_moved
      from public.resolve_accounting_date(j.date);
      v_void := public.post_entry(v_date, v_period, 'Anulación: ' || j.description, e.id,
        (select jsonb_agg(jsonb_build_object(
                  'account_id', l.account_id, 'debit', l.credit_cents, 'credit', l.debit_cents,
                  'member_id', l.member_id, 'project_id', l.project_id, 'variant_id', l.variant_id,
                  'memo', l.memo))
         from public.journal_lines l where l.entry_id = j.id),
        j.id);
    end if;
    perform public.revert_stock(e.id);
  end if;

  update public.events
  set status = 'anulado', void_entry_id = v_void, voided_by = v_uid, voided_at = now(),
      void_reason = btrim(p_reason)
  where id = e.id;

  insert into public.audit_log (actor, action, entity, entity_id, payload)
  values (v_uid, 'event.void', 'events', e.id::text, jsonb_build_object('reason', btrim(p_reason)));
  return public.event_result(e.id, false);
end;
$$;

-- submit_event: misma función de la Fase 1, ahora con los tipos de merch.
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
  v_merch := p_type in ('venta_merch', 'compra_merch', 'salida_merch', 'ajuste_inventario');
  if not v_merch then
    v_amount := (p_payload ->> 'amount_cents')::bigint;
    if v_amount is null or v_amount <= 0 or v_amount > 100000000000 then
      raise exception 'El monto no es válido' using errcode = 'P0001';
    end if;
  end if;
  if v_project is not null and not exists (select 1 from public.projects where id = v_project) then
    raise exception 'Ese proyecto no existe' using errcode = 'P0001';
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
    insert into public.events (client_id, type, captured_at, device_info, project_id, status, created_by)
    values (p_client_id, p_type, v_captured, left(p_payload ->> 'device', 300), v_project, v_status, v_uid)
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

-- ---------------------------------------------------------------------------
-- Catálogo de merch: lo edita el contador
-- ---------------------------------------------------------------------------
-- Crea o actualiza un producto con sus variantes.
--   { id?, name, category, emoji?, active?, variants: [{ id?, label, price_cents, low_stock_threshold?, active? }] }
create or replace function public.save_product(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_category public.merch_category := (p_payload ->> 'category')::public.merch_category;
  v_suffix text;
  v jsonb;
  v_sort integer := 0;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador edita los productos' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_payload ->> 'name', ''))) = 0 then
    raise exception 'Ponle nombre al producto' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_payload -> 'variants') <> 'array' or jsonb_array_length(p_payload -> 'variants') = 0 then
    raise exception 'El producto necesita al menos una variante' using errcode = 'P0001';
  end if;

  v_suffix := case v_category
    when 'playeras' then '01' when 'vinilos_cd' then '02' when 'stickers' then '03'
    when 'pines' then '04' when 'canas' then '05' else '99' end;

  if v_id is null then
    insert into public.products (category, name, emoji, inventory_account_id, revenue_account_id, created_by)
    values (v_category, btrim(p_payload ->> 'name'), coalesce(nullif(p_payload ->> 'emoji', ''), '👕'),
            public.account_id('1.4.' || v_suffix), public.account_id('4.2.' || v_suffix), (select auth.uid()))
    returning id into v_id;
  else
    -- La categoría no cambia una vez creado: decide las cuentas de sus movimientos.
    update public.products
    set name = btrim(p_payload ->> 'name'),
        emoji = coalesce(nullif(p_payload ->> 'emoji', ''), emoji),
        active = coalesce((p_payload ->> 'active')::boolean, active)
    where id = v_id;
    if not found then
      raise exception 'Ese producto no existe' using errcode = 'P0001';
    end if;
  end if;

  for v in select * from jsonb_array_elements(p_payload -> 'variants') loop
    v_sort := v_sort + 10;
    if length(btrim(coalesce(v ->> 'label', ''))) = 0 or coalesce((v ->> 'price_cents')::bigint, -1) < 0 then
      raise exception 'Cada variante necesita nombre y precio' using errcode = 'P0001';
    end if;
    if nullif(v ->> 'id', '') is null then
      insert into public.product_variants (product_id, sku, label, price_cents, low_stock_threshold, sort)
      values (v_id, 'M-' || upper(substr(replace(public.uuid_v7()::text, '-', ''), 21, 10)),
              btrim(v ->> 'label'), (v ->> 'price_cents')::bigint,
              coalesce((v ->> 'low_stock_threshold')::integer, 0), v_sort);
    else
      update public.product_variants
      set label = btrim(v ->> 'label'), price_cents = (v ->> 'price_cents')::bigint,
          low_stock_threshold = coalesce((v ->> 'low_stock_threshold')::integer, low_stock_threshold),
          active = coalesce((v ->> 'active')::boolean, active), sort = v_sort
      where id = (v ->> 'id')::uuid and product_id = v_id;
    end if;
  end loop;

  perform public.log_audit('product.save', 'products', v_id::text, p_payload);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create view public.v_inventory with (security_invoker = true) as
select pv.id as variant_id, p.id as product_id, p.name as product_name, p.emoji, p.category,
       pv.label, pv.sku, pv.price_cents, pv.stock_qty, pv.avg_cost_cents, pv.stock_value_cents,
       pv.low_stock_threshold, p.active and pv.active as active, p.sort as product_sort, pv.sort as variant_sort,
       case when pv.stock_qty < 0 then 'negativo'
            when pv.stock_qty <= pv.low_stock_threshold then 'bajo' else 'ok' end as stock_status
from public.product_variants pv
join public.products p on p.id = pv.product_id;

-- Ventas por día (hora de México), para el resumen de la noche.
create view public.v_merch_daily with (security_invoker = true) as
select (e.captured_at at time zone 'America/Mexico_City')::date as day,
       e.project_id,
       sum(s.qty)::integer as pieces,
       coalesce(sum(s.qty) filter (where s.is_gift), 0)::integer as gift_pieces,
       sum(s.unit_price_cents * s.qty)::bigint as revenue_cents,
       coalesce(sum(s.cost_cents) filter (where not s.is_gift), 0)::bigint as cost_cents
from public.sale_lines s
join public.events e on e.id = s.event_id
where e.status = 'registrado'
group by 1, 2;

-- El feed ahora incluye merch (las columnas nuevas van al final).
create or replace view public.v_event_feed with (security_invoker = true) as
select e.id, e.client_id, e.type, e.status, e.captured_at, e.created_at, e.created_by,
       e.project_id, e.note, e.void_reason,
       coalesce(x.amount_cents, i.amount_cents, t.amount_cents, f.amount_cents, s.amount_cents,
                sd.total_cents, pd.total_cents, sa.cost_cents) as amount_cents,
       c.name as category_name, c.emoji as category_emoji,
       x.paid_with, x.settlement_pref,
       coalesce(i.destination, f.place, s.origin) as place,
       t.from_kind, t.from_member, t.to_kind, t.to_member,
       f.kind as fund_kind, f.member_id as fund_member, f.direction,
       coalesce(x.description, i.description, t.note, s.description, pd.description, sa.note) as description,
       coalesce(sd.pieces, pd.pieces, abs(sa.qty)) as pieces,
       sa.kind as stock_kind
from public.events e
left join public.expense_details x on x.event_id = e.id
left join public.income_details i on i.event_id = e.id
left join public.cash_transfers t on t.event_id = e.id
left join public.fund_movements f on f.event_id = e.id
left join public.supplier_payments s on s.event_id = e.id
left join public.sale_details sd on sd.event_id = e.id
left join public.purchase_details pd on pd.event_id = e.id
left join public.stock_adjustments sa on sa.event_id = e.id
left join public.categories c on c.id = coalesce(x.category_id, i.category_id);

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['locations', 'products', 'product_variants', 'inventory_movements',
                           'sale_details', 'sale_lines', 'purchase_details', 'purchase_lines',
                           'stock_adjustments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_member())',
      t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;

  foreach t in array array['v_inventory', 'v_merch_daily', 'v_event_feed']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_contador(), public.is_active_member(), public.uuid_v7(),
  public.log_audit(text, text, text, jsonb, text),
  public.create_project(text, text, date, date, bigint, text),
  public.set_active_context(uuid),
  public.submit_event(uuid, public.event_type, jsonb, timestamptz),
  public.confirm_cash_transfer(uuid, boolean),
  public.void_event(uuid, text),
  public.save_product(jsonb)
to authenticated;

alter publication supabase_realtime add table public.product_variants;
alter publication supabase_realtime add table public.products;

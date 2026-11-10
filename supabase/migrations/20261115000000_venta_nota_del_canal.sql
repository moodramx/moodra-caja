-- POS: cuando la venta es por "Otro", se guarda a qué se refiere (pedido por Diego).
-- Cuando es de "Show", el show elegido va en events.project_id, como cualquier captura.
alter table public.sale_details add column channel_note text;

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

    insert into public.sale_details (event_id, channel, channel_note, payment_method, collected_by, total_cents, pieces)
    values (p_event, coalesce(p_payload ->> 'channel', 'otro')::public.sale_channel,
            left(nullif(btrim(p_payload ->> 'channel_note'), ''), 120),
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

-- El feed muestra esa nota como descripción de la venta.
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
       coalesce(x.description, i.description, t.note, s.description, pd.description, sa.note, sd.channel_note) as description,
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

revoke all on public.v_event_feed from anon, authenticated;
grant select on public.v_event_feed to authenticated;

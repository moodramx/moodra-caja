-- Fase 5a — Consultas de reportes. Son de solo lectura y respetan RLS (corren
-- con los permisos de quien consulta). Todos los reportes salen de aquí, así
-- que cuadran entre sí por construcción.

-- Cargos y abonos por cuenta en un rango de fechas, con filtros opcionales por
-- proyecto y por show. Base del estado de resultados, el balance y la balanza.
create or replace function public.report_account_totals(
  p_from date default null, p_to date default null, p_project uuid default null, p_show uuid default null
)
returns table (
  account_id uuid, code text, name text, type public.account_type, nature public.account_nature,
  member_id uuid, debit_cents bigint, credit_cents bigint
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.code, a.name, a.type, a.nature, a.member_id,
         coalesce(sum(l.debit_cents), 0)::bigint, coalesce(sum(l.credit_cents), 0)::bigint
  from public.accounts a
  join public.journal_lines l on l.account_id = a.id
  join public.journal_entries j on j.id = l.entry_id
  left join public.events e on e.id = j.source_event_id
  where (p_from is null or j.date >= p_from)
    and (p_to is null or j.date <= p_to)
    and (p_project is null or l.project_id = p_project)
    and (p_show is null or e.show_id = p_show)
  group by a.id;
$$;

-- Flujo de efectivo, método directo: por cada asiento, cuánto cambió el dinero
-- (cuentas 1.1 y 1.2), agrupado por tipo de movimiento. Los traspasos entre
-- bolsas (entregas, depósitos) dan cero y no aparecen.
create or replace function public.report_cash_flow(
  p_from date default null, p_to date default null, p_project uuid default null
)
returns table (kind text, detail text, inflow_cents bigint, outflow_cents bigint, net_cents bigint)
language sql
stable
set search_path = ''
as $$
  with per_entry as (
    select j.id,
           coalesce(e.type::text, 'manual') as kind,
           coalesce(c.name, '') as detail,
           sum(l.debit_cents - l.credit_cents) as net
    from public.journal_entries j
    join public.journal_lines l on l.entry_id = j.id
    join public.accounts a on a.id = l.account_id
    left join public.events e on e.id = j.source_event_id
    left join public.expense_details x on x.event_id = e.id
    left join public.income_details i on i.event_id = e.id
    left join public.categories c on c.id = coalesce(x.category_id, i.category_id)
    where (a.code like '1.1%' or a.code like '1.2%')
      and (p_from is null or j.date >= p_from)
      and (p_to is null or j.date <= p_to)
      and (p_project is null or l.project_id = p_project)
    group by j.id, e.type, c.name
  )
  select kind, detail,
         coalesce(sum(net) filter (where net > 0), 0)::bigint,
         coalesce(-sum(net) filter (where net < 0), 0)::bigint,
         sum(net)::bigint
  from per_entry
  where net <> 0
  group by kind, detail;
$$;

-- Merch por variante en un periodo: vendido, regalado, ingreso, costo y existencias.
create or replace function public.report_merch(p_from date default null, p_to date default null)
returns table (
  variant_id uuid, product_name text, label text, category public.merch_category, price_cents bigint,
  stock_qty integer, stock_value_cents bigint, avg_cost_cents bigint,
  sold_qty integer, gift_qty integer, revenue_cents bigint, cost_cents bigint, gift_cost_cents bigint
)
language sql
stable
set search_path = ''
as $$
  select pv.id, p.name, pv.label, p.category, pv.price_cents, pv.stock_qty, pv.stock_value_cents, pv.avg_cost_cents,
         coalesce(sum(s.qty) filter (where not s.is_gift), 0)::integer,
         coalesce(sum(s.qty) filter (where s.is_gift), 0)::integer,
         coalesce(sum(s.unit_price_cents * s.qty), 0)::bigint,
         coalesce(sum(s.cost_cents) filter (where not s.is_gift), 0)::bigint,
         coalesce(sum(s.cost_cents) filter (where s.is_gift), 0)::bigint
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  left join (
    select sl.* from public.sale_lines sl
    join public.events e on e.id = sl.event_id
    where e.status = 'registrado'
      and (p_from is null or (e.captured_at at time zone 'America/Mexico_City')::date >= p_from)
      and (p_to is null or (e.captured_at at time zone 'America/Mexico_City')::date <= p_to)
  ) s on s.variant_id = pv.id
  group by pv.id, p.id;
$$;

-- Movimientos de una cuenta (auxiliar), en orden.
create or replace function public.report_ledger(p_account uuid, p_from date default null, p_to date default null)
returns table (
  line_id uuid, entry_number bigint, date date, description text, debit_cents bigint, credit_cents bigint
)
language sql
stable
set search_path = ''
as $$
  select l.id, j.number, j.date, j.description, l.debit_cents, l.credit_cents
  from public.journal_lines l
  join public.journal_entries j on j.id = l.entry_id
  where l.account_id = p_account
    and (p_from is null or j.date >= p_from)
    and (p_to is null or j.date <= p_to)
  order by j.date, j.number, l.id;
$$;

-- Shows con su resultado y los boletos de su cierre, para punto de equilibrio y rentabilidad.
create view public.v_show_report with (security_invoker = true) as
select p.*, s.city, s.ticket_price_cents, s.percentage, s.fee_cents, s.expected_tickets,
       st.tickets_sold, st.gross_cents, st.commission_cents, st.income_cents, st.pending
from public.v_show_pnl p
join public.shows s on s.id = p.show_id
left join lateral (
  select ss.* from public.show_settlements ss
  join public.events e on e.id = ss.event_id
  where ss.show_id = s.id and e.status = 'registrado'
  order by e.created_at desc limit 1
) st on true;

-- Alertas para el tablero del contador.
create view public.v_alerts with (security_invoker = true) as
select 'stock_negativo'::text as kind, i.variant_id::text as ref,
       i.product_name || ' · ' || i.label as title, i.stock_qty::bigint as amount, null::timestamptz as since
from public.v_inventory i where i.active and i.stock_qty < 0
union all
select 'stock_bajo', i.variant_id::text, i.product_name || ' · ' || i.label, i.stock_qty::bigint, null
from public.v_inventory i
where i.active and i.stock_qty >= 0 and i.low_stock_threshold > 0 and i.stock_qty <= i.low_stock_threshold
union all
select 'entrega_sin_confirmar', e.id::text, 'Entrega de efectivo sin confirmar', t.amount_cents, e.created_at
from public.events e join public.cash_transfers t on t.event_id = e.id
where e.status = 'pendiente_confirmacion' and e.created_at < now() - interval '48 hours'
union all
select 'show_sin_cerrar', s.id::text, s.name, s.expected_income_cents, s.date::timestamptz
from public.shows s
where s.status = 'programado' and s.date < (now() at time zone 'America/Mexico_City')::date
union all
select 'registro_en_mes_cerrado', a.entity_id, 'Registro capturado en un mes ya cerrado', null, a.at
from public.audit_log a
where a.action = 'event.periodo_cerrado' and a.at > now() - interval '30 days';

revoke all on public.v_show_report, public.v_alerts from anon, authenticated;
grant select on public.v_show_report, public.v_alerts to authenticated;
grant execute on function
  public.report_account_totals(date, date, uuid, uuid),
  public.report_cash_flow(date, date, uuid),
  public.report_merch(date, date),
  public.report_ledger(uuid, date, date)
to authenticated;

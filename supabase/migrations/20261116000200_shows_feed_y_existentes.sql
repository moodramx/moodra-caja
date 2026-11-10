-- Fase 3 — El feed incluye los eventos de show, y los "shows sueltos" que ya
-- existían como proyecto reciben su renglón de show.

-- Proyectos "Show suelto" creados antes de esta fase: se les crea su show, sin
-- trato definido todavía (se edita después).
insert into public.shows (project_id, name, date, deal_type, created_by)
select p.id, p.name, coalesce(p.start_date, (p.created_at at time zone 'America/Mexico_City')::date),
       'sin_pago', p.created_by
from public.projects p
join public.project_types t on t.id = p.type_id
where t.code = 'SHW' and not exists (select 1 from public.shows s where s.project_id = p.id);

-- Las capturas que ya estaban en esos proyectos quedan ligadas a su show.
alter table public.events disable trigger events_guard;
update public.events e
set show_id = s.id
from public.shows s
join public.projects p on p.id = s.project_id
join public.project_types t on t.id = p.type_id
where e.project_id = s.project_id and e.show_id is null and t.code = 'SHW';
alter table public.events enable trigger events_guard;

create or replace view public.v_event_feed with (security_invoker = true) as
select e.id, e.client_id, e.type, e.status, e.captured_at, e.created_at, e.created_by,
       e.project_id, e.note, e.void_reason,
       coalesce(x.amount_cents, i.amount_cents, t.amount_cents, f.amount_cents, s.amount_cents,
                sd.total_cents, pd.total_cents, sa.cost_cents, st.income_cents, adv.amount_cents,
                rc.amount_cents) as amount_cents,
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
       coalesce(st.pending, false) as show_pending
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
left join public.categories c on c.id = coalesce(x.category_id, i.category_id);

revoke all on public.v_event_feed from anon, authenticated;
grant select on public.v_event_feed to authenticated;

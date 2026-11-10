-- Fase 3 (2/2) — Shows con su trato, plataformas de boletaje, cierre de show,
-- anticipos, cobro de pendientes y resultado por show y por gira.

create type public.deal_type as enum
  ('fee_fijo', 'porcentaje_taquilla', 'fee_mas_porcentaje', 'boletaje_propio', 'sin_pago');
create type public.show_status as enum ('programado', 'realizado', 'cerrado', 'cancelado');
create type public.commission_bearer as enum ('publico', 'banda');

-- ---------------------------------------------------------------------------
-- Plataformas de boletaje: cada una con su subcuenta por cobrar (1.3.02.NN)
-- ---------------------------------------------------------------------------
update public.accounts set is_postable = false where code = '1.3.02';

create table public.ticket_platforms (
  id uuid primary key default public.uuid_v7(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  contact_id uuid references public.contacts (id),
  commission_pct numeric(5, 2) not null default 0 check (commission_pct between 0 and 100),
  commission_fixed_cents bigint not null default 0 check (commission_fixed_cents >= 0),
  bearer public.commission_bearer not null default 'publico',
  settlement_days integer not null default 0 check (settlement_days >= 0),
  account_id uuid not null references public.accounts (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Crea o actualiza una plataforma (solo contador). Al crearla nace su subcuenta.
create or replace function public.save_ticket_platform(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_n integer;
  v_account uuid;
begin
  -- En una migración no hay sesión: la siembra entra sin usuario.
  if (select auth.uid()) is not null and not public.is_contador() then
    raise exception 'Solo el contador edita las plataformas de boletaje' using errcode = '42501';
  end if;
  if length(v_name) = 0 then
    raise exception 'Ponle nombre a la plataforma' using errcode = 'P0001';
  end if;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('moodra.ticket_platform'));
    select count(*) + 1 into v_n from public.ticket_platforms;
    insert into public.accounts (code, name, type, nature, parent_id)
    values ('1.3.02.' || lpad(v_n::text, 2, '0'), 'Por cobrar a ' || v_name, 'activo', 'deudora',
            public.account_id('1.3.02'))
    returning id into v_account;
    insert into public.ticket_platforms
      (name, commission_pct, commission_fixed_cents, bearer, settlement_days, account_id)
    values (v_name, coalesce((p_payload ->> 'commission_pct')::numeric, 0),
            coalesce((p_payload ->> 'commission_fixed_cents')::bigint, 0),
            coalesce(p_payload ->> 'bearer', 'publico')::public.commission_bearer,
            coalesce((p_payload ->> 'settlement_days')::integer, 0), v_account)
    returning id into v_id;
  else
    update public.ticket_platforms
    set name = v_name,
        commission_pct = coalesce((p_payload ->> 'commission_pct')::numeric, commission_pct),
        commission_fixed_cents = coalesce((p_payload ->> 'commission_fixed_cents')::bigint, commission_fixed_cents),
        bearer = coalesce((p_payload ->> 'bearer')::public.commission_bearer, bearer),
        settlement_days = coalesce((p_payload ->> 'settlement_days')::integer, settlement_days),
        active = coalesce((p_payload ->> 'active')::boolean, active)
    where id = v_id
    returning account_id into v_account;
    if v_account is null then
      raise exception 'Esa plataforma no existe' using errcode = 'P0001';
    end if;
    update public.accounts set name = 'Por cobrar a ' || v_name where id = v_account;
  end if;
  return v_id;
end;
$$;

-- Siembra con comisión y plazo en cero, por configurar (PRD §4.7).
select public.save_ticket_platform('{"name":"Passline"}'::jsonb);
select public.save_ticket_platform('{"name":"Plataforma propia (amigo)"}'::jsonb);

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
create table public.shows (
  id uuid primary key default public.uuid_v7(),
  project_id uuid not null references public.projects (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  venue_id uuid references public.contacts (id),
  city text,
  date date not null,
  deal_type public.deal_type not null,
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  percentage numeric(5, 2) not null default 0 check (percentage between 0 and 100),
  ticket_price_cents bigint not null default 0 check (ticket_price_cents >= 0),
  platform_id uuid references public.ticket_platforms (id),
  expected_tickets integer not null default 0 check (expected_tickets >= 0),
  expected_income_cents bigint not null default 0,
  status public.show_status not null default 'programado',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);
create index shows_project_idx on public.shows (project_id);
create index shows_date_idx on public.shows (date);

alter table public.events
  add constraint events_show_fkey foreign key (show_id) references public.shows (id);
alter table public.journal_lines
  add constraint journal_lines_show_fkey foreign key (show_id) references public.shows (id);
alter table public.app_settings
  add constraint app_settings_active_show_fkey foreign key (active_show_id) references public.shows (id);
create index events_show_idx on public.events (show_id) where show_id is not null;

-- Ingreso esperado según el trato.
create or replace function public.expected_show_income(
  p_deal public.deal_type, p_fee bigint, p_pct numeric, p_price bigint, p_tickets integer, p_platform uuid
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_gross bigint := coalesce(p_tickets, 0)::bigint * coalesce(p_price, 0);
  pl public.ticket_platforms;
begin
  case p_deal
    when 'fee_fijo' then return coalesce(p_fee, 0);
    when 'porcentaje_taquilla' then return round(v_gross * coalesce(p_pct, 0) / 100)::bigint;
    when 'fee_mas_porcentaje' then
      return coalesce(p_fee, 0) + round(v_gross * coalesce(p_pct, 0) / 100)::bigint;
    when 'boletaje_propio' then
      select * into pl from public.ticket_platforms where id = p_platform;
      if pl.id is not null and pl.bearer = 'banda' then
        return v_gross - round(v_gross * pl.commission_pct / 100)::bigint
               - coalesce(p_tickets, 0) * pl.commission_fixed_cents;
      end if;
      return v_gross;
    else return 0;
  end case;
end;
$$;

-- Crea o edita un show. Cualquier integrante puede. Si no se indica gira, nace
-- su propio proyecto "Show suelto".
create or replace function public.save_show(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_date date := (p_payload ->> 'date')::date;
  v_deal public.deal_type := (p_payload ->> 'deal_type')::public.deal_type;
  v_project uuid := nullif(p_payload ->> 'project_id', '')::uuid;
  v_platform uuid := nullif(p_payload ->> 'platform_id', '')::uuid;
  v_fee bigint := coalesce((p_payload ->> 'fee_cents')::bigint, 0);
  v_pct numeric := coalesce((p_payload ->> 'percentage')::numeric, 0);
  v_price bigint := coalesce((p_payload ->> 'ticket_price_cents')::bigint, 0);
  v_tickets integer := coalesce((p_payload ->> 'expected_tickets')::integer, 0);
  v_status public.show_status;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(v_name) = 0 or v_date is null or v_deal is null then
    raise exception 'El show necesita nombre, fecha y tipo de trato' using errcode = 'P0001';
  end if;
  if v_deal <> 'boletaje_propio' then
    v_platform := null;
  end if;

  if v_id is null then
    if v_project is null then
      v_project := (public.create_project('SHW', v_name, v_date)).id;
    elsif not exists (select 1 from public.projects where id = v_project and status <> 'cerrado') then
      raise exception 'Esa gira no existe o ya está cerrada' using errcode = 'P0001';
    end if;
    insert into public.shows
      (project_id, name, city, date, deal_type, fee_cents, percentage, ticket_price_cents, platform_id,
       expected_tickets, expected_income_cents, notes, created_by)
    values (v_project, v_name, nullif(btrim(p_payload ->> 'city'), ''), v_date, v_deal, v_fee, v_pct, v_price,
            v_platform, v_tickets,
            public.expected_show_income(v_deal, v_fee, v_pct, v_price, v_tickets, v_platform),
            nullif(btrim(p_payload ->> 'notes'), ''), (select auth.uid()))
    returning id into v_id;
  else
    select status into v_status from public.shows where id = v_id for update;
    if v_status is null then
      raise exception 'Ese show no existe' using errcode = 'P0001';
    end if;
    if v_status = 'cerrado' then
      raise exception 'El show ya está cerrado: para cambiarlo, anula su cierre' using errcode = 'P0001';
    end if;
    update public.shows
    set name = v_name, city = nullif(btrim(p_payload ->> 'city'), ''), date = v_date, deal_type = v_deal,
        fee_cents = v_fee, percentage = v_pct, ticket_price_cents = v_price, platform_id = v_platform,
        expected_tickets = v_tickets,
        expected_income_cents = public.expected_show_income(v_deal, v_fee, v_pct, v_price, v_tickets, v_platform),
        notes = nullif(btrim(p_payload ->> 'notes'), '')
    where id = v_id;
  end if;

  perform public.log_audit('show.save', 'shows', v_id::text, p_payload);
  return v_id;
end;
$$;

-- Cancelar o reactivar un show sin cerrar.
create or replace function public.set_show_cancelled(p_show_id uuid, p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  update public.shows
  set status = case when p_cancelled then 'cancelado' else 'programado' end::public.show_status
  where id = p_show_id and status in ('programado', 'realizado', 'cancelado');
  if not found then
    raise exception 'Ese show no existe o ya está cerrado' using errcode = 'P0001';
  end if;
  perform public.log_audit('show.cancel', 'shows', p_show_id::text, jsonb_build_object('cancelado', p_cancelled));
end;
$$;

-- Contexto activo: ahora puede ser un show de una gira.
drop function public.set_active_context(uuid);
create or replace function public.set_active_context(p_project_id uuid, p_show_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid := p_project_id;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if p_show_id is not null then
    select project_id into v_project from public.shows where id = p_show_id and status <> 'cancelado';
    if v_project is null then
      raise exception 'Ese show no existe o está cancelado' using errcode = 'P0001';
    end if;
  elsif v_project is not null and not exists (
    select 1 from public.projects where id = v_project and status <> 'cerrado'
  ) then
    raise exception 'Ese proyecto no existe o ya está cerrado' using errcode = 'P0001';
  end if;

  update public.app_settings
  set active_project_id = v_project, active_show_id = p_show_id, updated_at = now(),
      updated_by = (select auth.uid())
  where id;
  perform public.log_audit('context.set', 'app_settings', null,
    jsonb_build_object('project_id', v_project, 'show_id', p_show_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Detalle de los eventos de show
-- ---------------------------------------------------------------------------
create table public.show_settlements (
  event_id uuid primary key references public.events (id),
  show_id uuid not null references public.shows (id),
  deal_type public.deal_type not null,
  tickets_sold integer not null default 0 check (tickets_sold >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  share_cents bigint not null default 0 check (share_cents >= 0),       -- parte de la taquilla
  gross_cents bigint not null default 0 check (gross_cents >= 0),       -- boletaje propio, bruto
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  net_cents bigint not null default 0,                                  -- boletaje menos comisión
  income_cents bigint not null check (income_cents >= 0),               -- fee + taquilla + boletaje
  advance_applied_cents bigint not null default 0 check (advance_applied_cents >= 0),
  platform_id uuid references public.ticket_platforms (id),
  destination public.money_place,
  holder_member_id uuid references public.profiles (id),
  pending boolean not null
);
create index show_settlements_show_idx on public.show_settlements (show_id);

create table public.show_advances (
  event_id uuid primary key references public.events (id),
  show_id uuid not null references public.shows (id),
  amount_cents bigint not null check (amount_cents > 0),
  destination public.money_place not null,
  holder_member_id uuid references public.profiles (id)
);
create index show_advances_show_idx on public.show_advances (show_id);

-- Llegó el dinero de algo que estaba por cobrar (venue o boletera).
create table public.receivable_collections (
  event_id uuid primary key references public.events (id),
  account_id uuid not null references public.accounts (id),
  platform_id uuid references public.ticket_platforms (id),
  amount_cents bigint not null check (amount_cents > 0),
  destination public.money_place not null,
  holder_member_id uuid references public.profiles (id)
);

create trigger show_settlements_immutable before update or delete on public.show_settlements
  for each row execute function public.forbid_mutation();
create trigger show_advances_immutable before update or delete on public.show_advances
  for each row execute function public.forbid_mutation();
create trigger receivable_collections_immutable before update or delete on public.receivable_collections
  for each row execute function public.forbid_mutation();

create or replace function public.insert_show_detail(
  p_event uuid, p_type public.event_type, p_payload jsonb, p_uid uuid, p_contador boolean, p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shows;
  pl public.ticket_platforms;
  v_fee bigint := 0;
  v_share bigint := 0;
  v_gross bigint := 0;
  v_comm bigint := 0;
  v_adv bigint := 0;
  v_dest public.money_place := nullif(p_payload ->> 'destination', '')::public.money_place;
  v_account uuid;
begin
  if p_type in ('cierre_show', 'anticipo_show') then
    select sh.* into s from public.shows sh
    join public.events e on e.show_id = sh.id where e.id = p_event for update of sh;
    if s.id is null then
      raise exception 'Elige el show' using errcode = 'P0001';
    end if;
    if s.status = 'cerrado' then
      raise exception 'Ese show ya está cerrado' using errcode = 'P0001';
    end if;
    if s.status = 'cancelado' then
      raise exception 'Ese show está cancelado' using errcode = 'P0001';
    end if;
  end if;

  if p_type = 'cierre_show' then
    if s.deal_type in ('fee_fijo', 'fee_mas_porcentaje') then
      v_fee := coalesce((p_payload ->> 'fee_cents')::bigint, 0);
    end if;
    if s.deal_type in ('porcentaje_taquilla', 'fee_mas_porcentaje') then
      v_share := coalesce((p_payload ->> 'share_cents')::bigint, 0);
    end if;
    if s.deal_type = 'boletaje_propio' then
      v_gross := coalesce((p_payload ->> 'gross_cents')::bigint, 0);
      select * into pl from public.ticket_platforms where id = nullif(p_payload ->> 'platform_id', '')::uuid;
      if pl.id is not null and pl.bearer = 'banda' then
        v_comm := coalesce((p_payload ->> 'commission_cents')::bigint, 0);
      end if;
    end if;
    if v_fee < 0 or v_share < 0 or v_gross < 0 or v_comm < 0 or v_comm > v_gross then
      raise exception 'Los montos del cierre no son válidos' using errcode = 'P0001';
    end if;

    -- Anticipos ya cobrados de este show que aún no se han aplicado.
    select coalesce((select sum(a.amount_cents) from public.show_advances a
                     join public.events e on e.id = a.event_id
                     where a.show_id = s.id and e.status = 'registrado'), 0)
         - coalesce((select sum(st.advance_applied_cents) from public.show_settlements st
                     join public.events e on e.id = st.event_id
                     where st.show_id = s.id and e.status = 'registrado'), 0)
    into v_adv;
    v_adv := greatest(least(v_adv, v_fee + v_share), 0);
    if pl.id is not null then
      v_dest := null; -- lo de la boletera queda por cobrar hasta que liquide
    end if;

    insert into public.show_settlements
      (event_id, show_id, deal_type, tickets_sold, fee_cents, share_cents, gross_cents, commission_cents,
       net_cents, income_cents, advance_applied_cents, platform_id, destination, holder_member_id, pending)
    values (p_event, s.id, s.deal_type, coalesce((p_payload ->> 'tickets_sold')::integer, 0), v_fee, v_share,
            v_gross, v_comm, v_gross - v_comm, v_fee + v_share + v_gross, v_adv, pl.id, v_dest,
            case when v_dest = 'efectivo_integrante' then p_uid end, v_dest is null);
    update public.shows set status = 'cerrado' where id = s.id;

  elsif p_type = 'anticipo_show' then
    if v_dest is null then
      raise exception 'Dinos dónde quedó el anticipo' using errcode = 'P0001';
    end if;
    insert into public.show_advances (event_id, show_id, amount_cents, destination, holder_member_id)
    values (p_event, s.id, p_amount, v_dest, case when v_dest = 'efectivo_integrante' then p_uid end);

  else -- cobro_pendiente
    select * into pl from public.ticket_platforms where id = nullif(p_payload ->> 'platform_id', '')::uuid;
    if pl.id is not null and not p_contador then
      raise exception 'La liquidación de una boletera la registra el contador' using errcode = '42501';
    end if;
    v_account := coalesce(pl.account_id, public.account_id('1.3.01'));
    v_dest := coalesce(v_dest, 'cuenta_banda');
    if public.account_balance(v_account) < p_amount then
      raise exception 'El monto es mayor que lo que está por cobrar' using errcode = 'P0001';
    end if;
    insert into public.receivable_collections
      (event_id, account_id, platform_id, amount_cents, destination, holder_member_id)
    values (p_event, v_account, pl.id, p_amount, v_dest,
            case when v_dest = 'efectivo_integrante' then p_uid end);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posteo (PRD §5.3)
-- ---------------------------------------------------------------------------
create or replace function public.post_cierre_show(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.show_settlements;
  v_name text;
  v_lines jsonb := '[]'::jsonb;
  v_money bigint;
  v_member uuid;
  v_place uuid;
begin
  select * into st from public.show_settlements where event_id = e.id;
  if st.income_cents = 0 then
    return null; -- show sin pago: se cierra sin asiento; sus costos sí cuentan
  end if;
  select name into v_name from public.shows where id = st.show_id;
  v_member := coalesce(st.holder_member_id, e.created_by);
  -- Lo que no se cobró en el momento queda por cobrar al venue.
  v_place := case when st.destination is null then public.account_id('1.3.01')
                  else public.place_account(st.destination, st.holder_member_id) end;

  if st.advance_applied_cents > 0 then
    v_lines := v_lines || public.jl(public.account_id('2.3'), st.advance_applied_cents, 0, v_member, e.project_id);
  end if;
  v_money := st.fee_cents + st.share_cents - st.advance_applied_cents;
  if v_money > 0 then
    v_lines := v_lines || public.jl(v_place, v_money, 0, v_member, e.project_id);
  end if;
  if st.gross_cents > 0 then
    if st.platform_id is not null then
      v_lines := v_lines || public.jl(
        (select account_id from public.ticket_platforms where id = st.platform_id),
        st.net_cents, 0, v_member, e.project_id);
      if st.commission_cents > 0 then
        v_lines := v_lines || public.jl(public.account_id('5.2'), st.commission_cents, 0, v_member, e.project_id);
      end if;
    else
      v_lines := v_lines || public.jl(v_place, st.gross_cents, 0, v_member, e.project_id);
    end if;
  end if;

  if st.fee_cents > 0 then
    v_lines := v_lines || public.jl(public.account_id('4.1.01'), 0, st.fee_cents, v_member, e.project_id);
  end if;
  if st.share_cents > 0 then
    v_lines := v_lines || public.jl(public.account_id('4.1.02'), 0, st.share_cents, v_member, e.project_id);
  end if;
  if st.gross_cents > 0 then
    v_lines := v_lines || public.jl(public.account_id('4.1.03'), 0, st.gross_cents, v_member, e.project_id);
  end if;

  return public.post_entry(p_date, p_period, 'Cierre de show: ' || v_name, e.id, v_lines);
end;
$$;

create or replace function public.post_anticipo_show(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.show_advances;
begin
  select * into a from public.show_advances where event_id = e.id;
  return public.post_entry(p_date, p_period,
    'Anticipo de show: ' || (select name from public.shows where id = a.show_id), e.id,
    jsonb_build_array(
      public.jl(public.place_account(a.destination, a.holder_member_id), a.amount_cents, 0,
                coalesce(a.holder_member_id, e.created_by), e.project_id),
      public.jl(public.account_id('2.3'), 0, a.amount_cents, e.created_by, e.project_id)));
end;
$$;

create or replace function public.post_cobro_pendiente(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.receivable_collections;
begin
  select * into r from public.receivable_collections where event_id = e.id;
  return public.post_entry(p_date, p_period,
    case when r.platform_id is not null
         then 'Liquidación de ' || (select name from public.ticket_platforms where id = r.platform_id)
         else 'Pago pendiente de un venue' end, e.id,
    jsonb_build_array(
      public.jl(public.place_account(r.destination, r.holder_member_id), r.amount_cents, 0,
                coalesce(r.holder_member_id, e.created_by), e.project_id),
      public.jl(r.account_id, 0, r.amount_cents, e.created_by, e.project_id)));
end;
$$;

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

-- submit_event: ahora guarda el show de cada captura y acepta los eventos de show.
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
  v_merch := p_type in ('venta_merch', 'compra_merch', 'salida_merch', 'ajuste_inventario', 'cierre_show');
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

-- void_event: anular un cierre reabre el show.
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
    -- Anular el cierre reabre el show.
    if e.type = 'cierre_show' then
      update public.shows set status = 'programado' where id = e.show_id;
    end if;
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

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
-- Resultado por show: lo que se capturó con ese show (cierre, gastos, merch).
create view public.v_show_pnl with (security_invoker = true) as
select s.id as show_id, s.project_id, s.name, s.date, s.status, s.deal_type, s.expected_income_cents,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.code like '4.1%'), 0)::bigint as show_income_cents,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.code like '4.2%'), 0)::bigint as merch_revenue_cents,
       coalesce(sum(l.credit_cents - l.debit_cents)
                filter (where a.type = 'ingreso' and a.code not like '4.1%' and a.code not like '4.2%'), 0)::bigint
         as other_income_cents,
       coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.code = '5.1'), 0)::bigint as merch_cost_cents,
       coalesce(sum(l.debit_cents - l.credit_cents)
                filter (where a.type in ('costo', 'gasto', 'otro') and a.code <> '5.1'), 0)::bigint as costs_cents,
       (coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.type = 'ingreso'), 0)
        - coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.type in ('costo', 'gasto', 'otro')), 0))::bigint
         as net_cents
from public.shows s
left join public.events e on e.show_id = s.id
left join public.journal_entries j on j.source_event_id = e.id
left join public.journal_lines l on l.entry_id = j.id
left join public.accounts a on a.id = l.account_id
group by s.id;

-- Resultado por gira o proyecto: todo lo etiquetado con él, incluidos sus shows.
create view public.v_project_pnl with (security_invoker = true) as
select p.id as project_id, p.code, p.name,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.code like '4.1%'), 0)::bigint as show_income_cents,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.code like '4.2%'), 0)::bigint as merch_revenue_cents,
       coalesce(sum(l.credit_cents - l.debit_cents)
                filter (where a.type = 'ingreso' and a.code not like '4.1%' and a.code not like '4.2%'), 0)::bigint
         as other_income_cents,
       coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.code = '5.1'), 0)::bigint as merch_cost_cents,
       coalesce(sum(l.debit_cents - l.credit_cents)
                filter (where a.type in ('costo', 'gasto', 'otro') and a.code <> '5.1'), 0)::bigint as costs_cents,
       (coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.type = 'ingreso'), 0)
        - coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.type in ('costo', 'gasto', 'otro')), 0))::bigint
         as net_cents
from public.projects p
left join public.journal_lines l on l.project_id = p.id
left join public.accounts a on a.id = l.account_id
group by p.id;

-- Lo que está por cobrar (venues y boleteras) y lo cobrado por anticipado.
create view public.v_receivables with (security_invoker = true) as
select t.account_id, t.code, t.name, t.balance_cents, pl.id as platform_id, pl.settlement_days
from public.v_trial_balance t
left join public.ticket_platforms pl on pl.account_id = t.account_id
where (t.code like '1.3%' or t.code = '2.3') and t.balance_cents <> 0;

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ticket_platforms', 'shows', 'show_settlements', 'show_advances',
                           'receivable_collections']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_member())',
      t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;

  foreach t in array array['v_show_pnl', 'v_project_pnl', 'v_receivables']
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
  public.set_active_context(uuid, uuid),
  public.submit_event(uuid, public.event_type, jsonb, timestamptz),
  public.confirm_cash_transfer(uuid, boolean),
  public.void_event(uuid, text),
  public.save_product(jsonb),
  public.set_product_photo(uuid, text),
  public.save_show(jsonb),
  public.set_show_cancelled(uuid, boolean),
  public.save_ticket_platform(jsonb)
to authenticated;

alter publication supabase_realtime add table public.shows;

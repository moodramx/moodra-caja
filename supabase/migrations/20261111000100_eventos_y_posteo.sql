-- Fase 1 (2/2) — Eventos de negocio, funciones de posteo y RPCs.
-- El cliente nunca escribe en tablas: todo entra por submit_event,
-- confirm_cash_transfer y void_event (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.event_type as enum
  ('gasto', 'ingreso', 'entrega_efectivo', 'puse_dinero', 'reclasificacion', 'regreso_dinero', 'pago_proveedor');
create type public.event_status as enum ('registrado', 'pendiente_confirmacion', 'rechazado', 'anulado');
create type public.paid_with as enum ('efectivo_banda', 'caja', 'cuenta_banda', 'mi_dinero', 'pendiente');
create type public.settlement_pref as enum ('reembolso', 'compensar_reparto', 'aportacion');
create type public.money_place as enum ('efectivo_integrante', 'caja', 'cuenta_banda');
create type public.transfer_party as enum ('integrante', 'caja', 'banco');
create type public.fund_kind as enum ('prestamo', 'aportacion', 'reclasificacion', 'regreso');
create type public.reclass_direction as enum ('a_aportacion', 'a_prestamo');

-- ---------------------------------------------------------------------------
-- Eventos y detalle
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default public.uuid_v7(),
  client_id uuid not null unique,
  type public.event_type not null,
  captured_at timestamptz not null,
  device_info text,
  project_id uuid references public.projects (id),
  show_id uuid,
  status public.event_status not null,
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  void_reason text,
  note text,
  cfdi_uuid uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);
create index events_captured_idx on public.events (captured_at desc);
create index events_status_idx on public.events (status) where status = 'pendiente_confirmacion';

alter table public.journal_entries
  add constraint journal_entries_source_event_fkey
  foreign key (source_event_id) references public.events (id);

create table public.expense_details (
  event_id uuid primary key references public.events (id),
  category_id uuid not null references public.categories (id),
  amount_cents bigint not null check (amount_cents > 0),
  paid_with public.paid_with not null,
  payer_member_id uuid not null references public.profiles (id),
  settlement_pref public.settlement_pref,
  payee_contact_id uuid references public.contacts (id),
  description text,
  receipt_path text,
  ai_raw jsonb,
  check ((paid_with = 'mi_dinero') = (settlement_pref is not null))
);

create table public.income_details (
  event_id uuid primary key references public.events (id),
  category_id uuid not null references public.categories (id),
  account_id uuid not null references public.accounts (id),
  amount_cents bigint not null check (amount_cents > 0),
  destination public.money_place not null,
  holder_member_id uuid references public.profiles (id),
  description text,
  check ((destination = 'efectivo_integrante') = (holder_member_id is not null))
);

create table public.cash_transfers (
  event_id uuid primary key references public.events (id),
  from_kind public.transfer_party not null,
  from_member uuid references public.profiles (id),
  to_kind public.transfer_party not null,
  to_member uuid references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  note text,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  check ((from_kind = 'integrante') = (from_member is not null)),
  check ((to_kind = 'integrante') = (to_member is not null)),
  check (from_kind <> 'banco'),
  check (not (from_kind = to_kind and from_member is not distinct from to_member))
);
create index cash_transfers_to_member_idx on public.cash_transfers (to_member);

create table public.fund_movements (
  event_id uuid primary key references public.events (id),
  kind public.fund_kind not null,
  member_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  -- destino (préstamo/aportación) u origen (regreso) del dinero; null en reclasificación
  place public.money_place,
  holder_member_id uuid references public.profiles (id),
  direction public.reclass_direction,
  check ((kind = 'reclasificacion') = (direction is not null)),
  check ((kind = 'reclasificacion') = (place is null)),
  check ((place = 'efectivo_integrante') is not distinct from (holder_member_id is not null)
         or (place is null and holder_member_id is null))
);

create table public.supplier_payments (
  event_id uuid primary key references public.events (id),
  contact_id uuid references public.contacts (id),
  amount_cents bigint not null check (amount_cents > 0),
  origin public.money_place not null,
  holder_member_id uuid references public.profiles (id),
  description text,
  check ((origin = 'efectivo_integrante') = (holder_member_id is not null))
);

-- Inmutabilidad de eventos: solo cambian el estado y los datos de anulación.
create or replace function public.events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los eventos no se borran: se anulan' using errcode = 'P0001';
  end if;
  if (new.id, new.client_id, new.type, new.captured_at, new.project_id, new.show_id, new.created_at, new.created_by)
     is distinct from
     (old.id, old.client_id, old.type, old.captured_at, old.project_id, old.show_id, old.created_at, old.created_by)
  then
    raise exception 'Los eventos no se editan: se anulan y se vuelven a capturar' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger events_guard before update or delete on public.events
  for each row execute function public.events_guard();
create trigger events_no_truncate before truncate on public.events
  for each statement execute function public.forbid_mutation();

create or replace function public.cash_transfers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or (new.event_id, new.from_kind, new.from_member, new.to_kind, new.to_member, new.amount_cents, new.note)
        is distinct from
        (old.event_id, old.from_kind, old.from_member, old.to_kind, old.to_member, old.amount_cents, old.note)
     or old.confirmed_at is not null
  then
    raise exception 'Las entregas no se editan ni se borran' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger cash_transfers_guard before update or delete on public.cash_transfers
  for each row execute function public.cash_transfers_guard();

create trigger expense_details_immutable before update or delete on public.expense_details
  for each row execute function public.forbid_mutation();
create trigger income_details_immutable before update or delete on public.income_details
  for each row execute function public.forbid_mutation();
create trigger fund_movements_immutable before update or delete on public.fund_movements
  for each row execute function public.forbid_mutation();
create trigger supplier_payments_immutable before update or delete on public.supplier_payments
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------
create or replace function public.place_account(p_place public.money_place, p_member uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case p_place
    when 'caja' then public.account_id('1.1.01')
    when 'cuenta_banda' then public.account_id('1.2.01')
    else public.member_account(p_member, 'efectivo')
  end;
$$;

create or replace function public.party_account(p_kind public.transfer_party, p_member uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'caja' then public.account_id('1.1.01')
    when 'banco' then public.account_id('1.2.01')
    else public.member_account(p_member, 'efectivo')
  end;
$$;

-- Saldo de una cuenta como debe − haber.
create or replace function public.account_balance(p_account uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(debit_cents - credit_cents), 0)::bigint
  from public.journal_lines where account_id = p_account;
$$;

-- Línea de asiento en JSON para post_entry.
create or replace function public.jl(
  p_account uuid, p_debit bigint, p_credit bigint, p_member uuid default null, p_project uuid default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('account_id', p_account, 'debit', p_debit, 'credit', p_credit,
                            'member_id', p_member, 'project_id', p_project);
$$;

-- Fecha contable: la del hecho; si su periodo está cerrado, hoy (periodo abierto).
create or replace function public.resolve_accounting_date(
  p_date date, out o_date date, out o_period uuid, out o_moved boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.period_status;
  v_today date;
begin
  o_date := p_date;
  o_moved := false;
  for i in 1..2 loop
    insert into public.periods (year, month)
    values (extract(year from o_date)::int, extract(month from o_date)::int)
    on conflict (year, month) do nothing;
    select id, status into o_period, v_status from public.periods
    where year = extract(year from o_date)::int and month = extract(month from o_date)::int;
    exit when v_status = 'abierto';

    select (now() at time zone timezone)::date into v_today from public.app_settings where id;
    if o_moved or o_date = v_today then
      raise exception 'No hay periodo abierto para registrar' using errcode = 'P0001';
    end if;
    o_date := v_today;
    o_moved := true;
  end loop;
end;
$$;

-- Inserta un asiento con sus líneas. Único punto de escritura del diario.
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

  insert into public.journal_lines (entry_id, account_id, debit_cents, credit_cents, member_id, project_id, memo)
  select v_id, (l ->> 'account_id')::uuid, (l ->> 'debit')::bigint, (l ->> 'credit')::bigint,
         (l ->> 'member_id')::uuid, (l ->> 'project_id')::uuid, l ->> 'memo'
  from jsonb_array_elements(p_lines) l;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones de posteo (PRD §5.3). Cada una arma las líneas de su evento.
-- ---------------------------------------------------------------------------
create or replace function public.post_gasto(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.expense_details;
  c public.categories;
  v_is_show boolean := false;
  v_expense uuid;
  v_credit uuid;
begin
  select * into x from public.expense_details where event_id = e.id;
  select * into c from public.categories where id = x.category_id;
  if e.project_id is not null then
    select t.is_show into v_is_show
    from public.projects p join public.project_types t on t.id = p.type_id
    where p.id = e.project_id;
  end if;
  v_expense := case when v_is_show and c.account_show_id is not null
                    then c.account_show_id else c.account_general_id end;
  v_credit := case x.paid_with
    when 'efectivo_banda' then public.member_account(x.payer_member_id, 'efectivo')
    when 'caja' then public.account_id('1.1.01')
    when 'cuenta_banda' then public.account_id('1.2.01')
    when 'pendiente' then public.account_id('2.2')
    else public.member_account(
      x.payer_member_id,
      case when x.settlement_pref = 'aportacion' then 'aportaciones' else 'por_regresar' end
        ::public.member_account_kind)
  end;

  return public.post_entry(p_date, p_period,
    'Gasto: ' || c.name || coalesce(' — ' || nullif(btrim(x.description), ''), ''), e.id,
    jsonb_build_array(
      public.jl(v_expense, x.amount_cents, 0, x.payer_member_id, e.project_id),
      public.jl(v_credit, 0, x.amount_cents, x.payer_member_id, e.project_id)));
end;
$$;

create or replace function public.post_ingreso(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.income_details;
  c public.categories;
begin
  select * into i from public.income_details where event_id = e.id;
  select * into c from public.categories where id = i.category_id;
  return public.post_entry(p_date, p_period,
    'Cobro: ' || c.name || coalesce(' — ' || nullif(btrim(i.description), ''), ''), e.id,
    jsonb_build_array(
      public.jl(public.place_account(i.destination, i.holder_member_id), i.amount_cents, 0,
                coalesce(i.holder_member_id, e.created_by), e.project_id),
      public.jl(i.account_id, 0, i.amount_cents, e.created_by, e.project_id)));
end;
$$;

create or replace function public.post_entrega(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.cash_transfers;
begin
  select * into t from public.cash_transfers where event_id = e.id;
  return public.post_entry(p_date, p_period,
    case t.to_kind when 'banco' then 'Depósito a la cuenta'
                   when 'caja' then 'Entrega de efectivo a la caja'
                   else 'Entrega de efectivo' end, e.id,
    jsonb_build_array(
      public.jl(public.party_account(t.to_kind, t.to_member), t.amount_cents, 0, t.to_member, e.project_id),
      public.jl(public.party_account(t.from_kind, t.from_member), 0, t.amount_cents, t.from_member, e.project_id)));
end;
$$;

create or replace function public.post_fondo(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fund_movements;
  v_debit uuid;
  v_credit uuid;
  v_desc text;
begin
  select * into f from public.fund_movements where event_id = e.id;
  case f.kind
    when 'prestamo' then
      v_debit := public.place_account(f.place, f.holder_member_id);
      v_credit := public.member_account(f.member_id, 'por_regresar');
      v_desc := 'Puso dinero (se le regresa)';
    when 'aportacion' then
      v_debit := public.place_account(f.place, f.holder_member_id);
      v_credit := public.member_account(f.member_id, 'aportaciones');
      v_desc := 'Puso dinero (aportación)';
    when 'regreso' then
      v_debit := public.member_account(f.member_id, 'por_regresar');
      v_credit := public.place_account(f.place, f.holder_member_id);
      v_desc := 'Regreso de dinero a integrante';
    else
      if f.direction = 'a_aportacion' then
        v_debit := public.member_account(f.member_id, 'por_regresar');
        v_credit := public.member_account(f.member_id, 'aportaciones');
        v_desc := 'Reclasificación: préstamo → aportación';
      else
        v_debit := public.member_account(f.member_id, 'aportaciones');
        v_credit := public.member_account(f.member_id, 'por_regresar');
        v_desc := 'Reclasificación: aportación → préstamo';
      end if;
  end case;

  return public.post_entry(p_date, p_period, v_desc, e.id,
    jsonb_build_array(
      public.jl(v_debit, f.amount_cents, 0, f.member_id, e.project_id),
      public.jl(v_credit, 0, f.amount_cents, f.member_id, e.project_id)));
end;
$$;

create or replace function public.post_pago_proveedor(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.supplier_payments;
begin
  select * into s from public.supplier_payments where event_id = e.id;
  return public.post_entry(p_date, p_period,
    'Pago a proveedor' || coalesce(' — ' || nullif(btrim(s.description), ''), ''), e.id,
    jsonb_build_array(
      public.jl(public.account_id('2.2'), s.amount_cents, 0, e.created_by, e.project_id),
      public.jl(public.place_account(s.origin, s.holder_member_id), 0, s.amount_cents,
                coalesce(s.holder_member_id, e.created_by), e.project_id)));
end;
$$;

-- Postea el asiento de un evento y lo deja registrado.
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

create or replace function public.event_result(p_event uuid, p_duplicate boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('event_id', e.id, 'client_id', e.client_id, 'status', e.status,
                            'journal_entry_id', e.journal_entry_id, 'note', e.note,
                            'duplicate', p_duplicate)
  from public.events e where e.id = p_event;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit_event — valida, guarda el evento y su detalle, postea y audita.
-- Idempotente por client_id.
-- ---------------------------------------------------------------------------
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
  v_amount := (p_payload ->> 'amount_cents')::bigint;
  if v_amount is null or v_amount <= 0 or v_amount > 100000000000 then
    raise exception 'El monto no es válido' using errcode = 'P0001';
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
-- RPC: confirm_cash_transfer — el receptor (o el contador, para caja y banco)
-- confirma o rechaza. El asiento se postea hasta que se confirma.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_cash_transfer(p_event_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  e public.events;
  t public.cash_transfers;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event_id and type = 'entrega_efectivo' for update;
  if e.id is null then
    raise exception 'Esa entrega no existe' using errcode = 'P0001';
  end if;
  if e.status <> 'pendiente_confirmacion' then
    return public.event_result(e.id, true);
  end if;
  select * into t from public.cash_transfers where event_id = e.id;
  if not ((t.to_kind = 'integrante' and t.to_member = v_uid)
          or (t.to_kind <> 'integrante' and public.is_contador())) then
    raise exception 'Solo quien recibe puede confirmar la entrega' using errcode = '42501';
  end if;

  if p_accept then
    update public.cash_transfers set confirmed_by = v_uid, confirmed_at = now() where event_id = e.id;
    perform public.post_event(e.id);
  else
    update public.events set status = 'rechazado' where id = e.id;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, payload)
  values (v_uid, case when p_accept then 'transfer.confirm' else 'transfer.reject' end,
          'events', e.id::text, jsonb_build_object('amount_cents', t.amount_cents));
  return public.event_result(e.id, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: void_event — anula con asiento de reversa. El autor puede anular lo
-- suyo dentro de la ventana (24 h por default); después, solo el contador.
-- ---------------------------------------------------------------------------
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
    select * into j from public.journal_entries where id = e.journal_entry_id;
    select o_date, o_period, o_moved into v_date, v_period, v_moved
    from public.resolve_accounting_date(j.date);
    v_void := public.post_entry(v_date, v_period, 'Anulación: ' || j.description, e.id,
      (select jsonb_agg(jsonb_build_object(
                'account_id', l.account_id, 'debit', l.credit_cents, 'credit', l.debit_cents,
                'member_id', l.member_id, 'project_id', l.project_id, 'memo', l.memo))
       from public.journal_lines l where l.entry_id = j.id),
      j.id);
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
-- Vistas (respetan RLS de quien consulta)
-- ---------------------------------------------------------------------------
create view public.v_trial_balance with (security_invoker = true) as
select a.id as account_id, a.code, a.name, a.type, a.nature, a.member_id,
       coalesce(sum(l.debit_cents), 0)::bigint as debit_cents,
       coalesce(sum(l.credit_cents), 0)::bigint as credit_cents,
       (case when a.nature = 'deudora' then 1 else -1 end
        * coalesce(sum(l.debit_cents - l.credit_cents), 0))::bigint as balance_cents
from public.accounts a
left join public.journal_lines l on l.account_id = a.id
where a.is_postable
group by a.id;

create view public.v_account_balances with (security_invoker = true) as
select a.id as account_id, a.code, a.name, p.year, p.month,
       sum(l.debit_cents)::bigint as debit_cents, sum(l.credit_cents)::bigint as credit_cents
from public.journal_lines l
join public.journal_entries j on j.id = l.entry_id
join public.periods p on p.id = j.period_id
join public.accounts a on a.id = l.account_id
group by a.id, p.year, p.month;

create view public.v_member_balances with (security_invoker = true) as
select p.id as member_id, p.display_name, p.emoji, p.activo,
       coalesce(sum(b.balance_cents) filter (where b.member_kind = 'efectivo'), 0)::bigint as cash_cents,
       coalesce(sum(b.balance_cents) filter (where b.member_kind = 'por_regresar'), 0)::bigint as owed_cents,
       coalesce(sum(b.balance_cents) filter (where b.member_kind = 'aportaciones'), 0)::bigint as contributions_cents,
       coalesce(sum(b.balance_cents) filter (where b.member_kind = 'repartos'), 0)::bigint as distributions_cents,
       coalesce(sum(b.balance_cents) filter (where b.member_kind = 'reparto_por_pagar'), 0)::bigint
         as distributions_payable_cents
from public.profiles p
left join (
  select a.member_id, a.member_kind, t.balance_cents
  from public.accounts a join public.v_trial_balance t on t.account_id = a.id
  where a.member_id is not null
) b on b.member_id = p.id
group by p.id;

create view public.v_cash_position with (security_invoker = true) as
select case when t.code = '1.1.01' then 'caja' when t.code = '1.2.01' then 'banco' else 'integrante' end as kind,
       t.member_id, t.name, t.balance_cents
from public.v_trial_balance t
join public.accounts a on a.id = t.account_id
where t.code in ('1.1.01', '1.2.01') or a.member_kind = 'efectivo';

create view public.v_results_by_period with (security_invoker = true) as
select p.year, p.month,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.type = 'ingreso'), 0)::bigint as income_cents,
       coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.type in ('costo', 'gasto', 'otro')), 0)::bigint
         as expense_cents
from public.journal_lines l
join public.journal_entries j on j.id = l.entry_id
join public.periods p on p.id = j.period_id
join public.accounts a on a.id = l.account_id
group by p.year, p.month;

create view public.v_results_by_project with (security_invoker = true) as
select l.project_id,
       coalesce(sum(l.credit_cents - l.debit_cents) filter (where a.type = 'ingreso'), 0)::bigint as income_cents,
       coalesce(sum(l.debit_cents - l.credit_cents) filter (where a.type in ('costo', 'gasto', 'otro')), 0)::bigint
         as expense_cents
from public.journal_lines l
join public.accounts a on a.id = l.account_id
where l.project_id is not null
group by l.project_id;

-- Feed: un renglón por evento, con lo necesario para pintarlo en lenguaje humano.
create view public.v_event_feed with (security_invoker = true) as
select e.id, e.client_id, e.type, e.status, e.captured_at, e.created_at, e.created_by,
       e.project_id, e.note, e.void_reason,
       coalesce(x.amount_cents, i.amount_cents, t.amount_cents, f.amount_cents, s.amount_cents) as amount_cents,
       c.name as category_name, c.emoji as category_emoji,
       x.paid_with, x.settlement_pref,
       coalesce(i.destination, f.place, s.origin) as place,
       t.from_kind, t.from_member, t.to_kind, t.to_member,
       f.kind as fund_kind, f.member_id as fund_member, f.direction,
       coalesce(x.description, i.description, t.note, s.description) as description
from public.events e
left join public.expense_details x on x.event_id = e.id
left join public.income_details i on i.event_id = e.id
left join public.cash_transfers t on t.event_id = e.id
left join public.fund_movements f on f.event_id = e.id
left join public.supplier_payments s on s.event_id = e.id
left join public.categories c on c.id = coalesce(x.category_id, i.category_id);

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['events', 'expense_details', 'income_details', 'cash_transfers',
                           'fund_movements', 'supplier_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_member())',
      t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;

  foreach t in array array['v_trial_balance', 'v_account_balances', 'v_member_balances',
                           'v_cash_position', 'v_results_by_period', 'v_results_by_project', 'v_event_feed']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Funciones: nada es ejecutable por el cliente salvo las RPC listadas.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  public.is_contador(), public.is_active_member(),
  public.log_audit(text, text, text, jsonb, text),
  public.create_project(text, text, date, date, bigint, text),
  public.set_active_context(uuid),
  public.submit_event(uuid, public.event_type, jsonb, timestamptz),
  public.confirm_cash_transfer(uuid, boolean),
  public.void_event(uuid, text)
to authenticated;

-- Las vistas con security_invoker llaman a estas funciones con el rol del usuario.
grant execute on function public.uuid_v7() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: feed, contexto activo y proyectos nuevos
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.app_settings;
alter publication supabase_realtime add table public.projects;

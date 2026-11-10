-- Fases 5b y 5c — Operación del contador: repartos y su pago, arqueos de
-- efectivo, asiento manual, cierre y reapertura de mes, cierre de año, sueldo
-- del becario y catálogos editables.

alter table public.app_settings
  add column intern_salary_cents bigint not null default 700000 check (intern_salary_cents >= 0);

-- ---------------------------------------------------------------------------
-- Tablas de detalle
-- ---------------------------------------------------------------------------
create table public.distributions (
  event_id uuid primary key references public.events (id),
  total_cents bigint not null check (total_cents > 0),
  note text
);
create table public.distribution_shares (
  event_id uuid not null references public.distributions (event_id),
  member_id uuid not null references public.profiles (id),
  gross_cents bigint not null check (gross_cents >= 0),
  -- Lo que se le debía y pidió cobrar junto con el reparto.
  compensation_cents bigint not null default 0 check (compensation_cents >= 0),
  primary key (event_id, member_id)
);
create table public.distribution_payments (
  event_id uuid primary key references public.events (id),
  member_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  origin public.money_place not null,
  holder_member_id uuid references public.profiles (id)
);
create table public.cash_counts (
  event_id uuid primary key references public.events (id),
  place public.money_place not null check (place <> 'cuenta_banda'),
  member_id uuid references public.profiles (id),
  counted_cents bigint not null check (counted_cents >= 0),
  expected_cents bigint not null,
  diff_cents bigint not null,
  note text,
  check ((place = 'efectivo_integrante') = (member_id is not null))
);
create table public.manual_entries (
  event_id uuid primary key references public.events (id),
  reason text not null check (length(btrim(reason)) >= 5),
  total_cents bigint not null check (total_cents > 0),
  lines jsonb not null
);
create table public.year_closings (
  year integer primary key check (year between 2020 and 2100),
  entry_id uuid not null references public.journal_entries (id),
  result_cents bigint not null,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['distributions', 'distribution_shares', 'distribution_payments', 'cash_counts',
                           'manual_entries', 'year_closings']
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
-- Repartos
-- ---------------------------------------------------------------------------
-- Lo que cada integrante pidió "descontar del próximo reparto" y sigue sin
-- cobrarse: sus gastos marcados así, menos lo ya incluido en repartos
-- anteriores, sin pasar de lo que hoy se le debe.
create or replace function public.pending_compensation(p_member uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, least(
    -public.account_balance(public.member_account(p_member, 'por_regresar')),
    coalesce((select sum(x.amount_cents) from public.expense_details x
              join public.events e on e.id = x.event_id
              where x.payer_member_id = p_member and x.settlement_pref = 'compensar_reparto'
                and e.status = 'registrado'), 0)
    - coalesce((select sum(s.compensation_cents) from public.distribution_shares s
                join public.events e on e.id = s.event_id
                where s.member_id = p_member and e.status = 'registrado'), 0)))::bigint;
$$;

-- Vista previa de un reparto de p_amount: qué le toca a cada quien.
create or replace function public.distribution_preview(p_amount bigint)
returns table (member_id uuid, display_name text, gross_cents bigint, compensation_cents bigint, net_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select p.id, p.display_name, row_number() over (order by p.id) as pos, count(*) over () as n
    from public.profiles p where p.activo and p.participa_reparto
  )
  select m.id, m.display_name,
         (p_amount / m.n + case when m.pos <= p_amount % m.n then 1 else 0 end)::bigint,
         public.pending_compensation(m.id),
         (p_amount / m.n + case when m.pos <= p_amount % m.n then 1 else 0 end
          + public.pending_compensation(m.id))::bigint
  from members m
  where public.is_active_member()
  order by m.pos;
$$;

-- ---------------------------------------------------------------------------
-- Detalle (lo llama submit_event)
-- ---------------------------------------------------------------------------
create or replace function public.insert_admin_detail(
  p_event uuid, p_type public.event_type, p_payload jsonb, p_uid uuid, p_contador boolean, p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_place public.money_place;
  v_holder uuid;
  v_account uuid;
  v_counted bigint;
  v_expected bigint;
  v_debit bigint := 0;
  v_credit bigint := 0;
  l jsonb;
  a public.accounts;
begin
  if p_type = 'reparto' then
    if not p_contador then
      raise exception 'Solo el contador hace repartos' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles where activo and participa_reparto) then
      raise exception 'Nadie participa en los repartos' using errcode = 'P0001';
    end if;
    insert into public.distributions (event_id, total_cents, note)
    values (p_event, p_amount, nullif(btrim(p_payload ->> 'note'), ''));
    insert into public.distribution_shares (event_id, member_id, gross_cents, compensation_cents)
    select p_event, d.member_id, d.gross_cents, d.compensation_cents
    from public.distribution_preview(p_amount) d;

  elsif p_type = 'pago_reparto' then
    if not p_contador then
      raise exception 'Solo el contador paga repartos' using errcode = '42501';
    end if;
    v_member := (p_payload ->> 'member_id')::uuid;
    v_place := (p_payload ->> 'origin')::public.money_place;
    v_holder := case when v_place = 'efectivo_integrante'
                     then coalesce(nullif(p_payload ->> 'holder_member_id', '')::uuid, p_uid) end;
    if -public.account_balance(public.member_account(v_member, 'reparto_por_pagar')) < p_amount then
      raise exception 'El monto es mayor que el reparto pendiente' using errcode = 'P0001';
    end if;
    insert into public.distribution_payments (event_id, member_id, amount_cents, origin, holder_member_id)
    values (p_event, v_member, p_amount, v_place, v_holder);

  elsif p_type = 'arqueo' then
    v_place := (p_payload ->> 'place')::public.money_place;
    v_counted := (p_payload ->> 'counted_cents')::bigint;
    if v_counted is null or v_counted < 0 or v_counted > 100000000000 then
      raise exception 'Dinos cuánto contaste' using errcode = 'P0001';
    end if;
    if v_place = 'caja' then
      if not p_contador then
        raise exception 'Solo el contador cuenta la caja' using errcode = '42501';
      end if;
      v_account := public.account_id('1.1.01');
    elsif v_place = 'efectivo_integrante' then
      v_member := coalesce(nullif(p_payload ->> 'member_id', '')::uuid, p_uid);
      if v_member <> p_uid and not p_contador then
        raise exception 'Solo puedes contar tu propio efectivo' using errcode = '42501';
      end if;
      v_account := public.member_account(v_member, 'efectivo');
      if v_account is null then
        raise exception 'Ese integrante no existe' using errcode = 'P0001';
      end if;
    else
      raise exception 'El arqueo es de efectivo: caja o lo que trae un integrante' using errcode = 'P0001';
    end if;
    v_expected := public.account_balance(v_account);
    insert into public.cash_counts (event_id, place, member_id, counted_cents, expected_cents, diff_cents, note)
    values (p_event, v_place, v_member, v_counted, v_expected, v_counted - v_expected,
            nullif(btrim(p_payload ->> 'note'), ''));

  else
    -- Asiento manual
    if not p_contador then
      raise exception 'Solo el contador captura asientos manuales' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_payload ->> 'reason', ''))) < 5 then
      raise exception 'Explica el motivo del asiento' using errcode = 'P0001';
    end if;
    if jsonb_array_length(coalesce(p_payload -> 'lines', '[]'::jsonb)) < 2 then
      raise exception 'Un asiento lleva al menos dos renglones' using errcode = 'P0001';
    end if;
    for l in select * from jsonb_array_elements(p_payload -> 'lines')
    loop
      select * into a from public.accounts where id = (l ->> 'account_id')::uuid;
      if a.id is null or not a.is_postable or not a.active then
        raise exception 'Una de las cuentas no existe o no admite movimientos' using errcode = 'P0001';
      end if;
      if coalesce((l ->> 'debit_cents')::bigint, 0) < 0 or coalesce((l ->> 'credit_cents')::bigint, 0) < 0
         or (coalesce((l ->> 'debit_cents')::bigint, 0) > 0) = (coalesce((l ->> 'credit_cents')::bigint, 0) > 0) then
        raise exception 'Cada renglón lleva cargo o abono, no ambos' using errcode = 'P0001';
      end if;
      v_debit := v_debit + coalesce((l ->> 'debit_cents')::bigint, 0);
      v_credit := v_credit + coalesce((l ->> 'credit_cents')::bigint, 0);
    end loop;
    if v_debit <> v_credit then
      raise exception 'El asiento no cuadra: cargos % ≠ abonos %', v_debit, v_credit using errcode = 'P0001';
    end if;
    insert into public.manual_entries (event_id, reason, total_cents, lines)
    values (p_event, btrim(p_payload ->> 'reason'), v_debit, p_payload -> 'lines');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contabilidad
-- ---------------------------------------------------------------------------
-- Reparto: D 3.2.x · H 2.4.x por la parte de cada quien; y lo que se le debía y
-- pidió cobrar con el reparto pasa de "por regresar" a "reparto por pagar".
create or replace function public.post_reparto(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_lines jsonb := '[]'::jsonb;
begin
  for s in select * from public.distribution_shares where event_id = e.id order by member_id
  loop
    if s.gross_cents > 0 then
      v_lines := v_lines
        || public.jl(public.member_account(s.member_id, 'repartos'), s.gross_cents, 0, s.member_id, e.project_id)
        || public.jl(public.member_account(s.member_id, 'reparto_por_pagar'), 0, s.gross_cents, s.member_id, e.project_id);
    end if;
    if s.compensation_cents > 0 then
      v_lines := v_lines
        || public.jl(public.member_account(s.member_id, 'por_regresar'), s.compensation_cents, 0, s.member_id, null)
        || public.jl(public.member_account(s.member_id, 'reparto_por_pagar'), 0, s.compensation_cents, s.member_id, null);
    end if;
  end loop;
  return public.post_entry(p_date, p_period, 'Reparto entre integrantes', e.id, v_lines);
end;
$$;

create or replace function public.post_pago_reparto(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.distribution_payments;
begin
  select * into p from public.distribution_payments where event_id = e.id;
  return public.post_entry(p_date, p_period, 'Pago de reparto', e.id,
    jsonb_build_array(
      public.jl(public.member_account(p.member_id, 'reparto_por_pagar'), p.amount_cents, 0, p.member_id, null),
      public.jl(case p.origin
                  when 'caja' then public.account_id('1.1.01')
                  when 'cuenta_banda' then public.account_id('1.2.01')
                  else public.member_account(p.holder_member_id, 'efectivo') end,
                0, p.amount_cents, p.member_id, null)));
end;
$$;

-- Arqueo: faltante D 7.3 · H efectivo; sobrante D efectivo · H 7.3. Si cuadra, no hay asiento.
create or replace function public.post_arqueo(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cash_counts;
  v_cash uuid;
  v_diff uuid := public.account_id('7.3');
begin
  select * into c from public.cash_counts where event_id = e.id;
  if c.diff_cents = 0 then
    return null;
  end if;
  v_cash := case when c.place = 'caja' then public.account_id('1.1.01')
                 else public.member_account(c.member_id, 'efectivo') end;
  return public.post_entry(p_date, p_period,
    'Arqueo de efectivo: ' || case when c.diff_cents < 0 then 'faltante' else 'sobrante' end, e.id,
    case when c.diff_cents < 0
      then jsonb_build_array(public.jl(v_diff, -c.diff_cents, 0, c.member_id, null),
                             public.jl(v_cash, 0, -c.diff_cents, c.member_id, null))
      else jsonb_build_array(public.jl(v_cash, c.diff_cents, 0, c.member_id, null),
                             public.jl(v_diff, 0, c.diff_cents, c.member_id, null))
    end);
end;
$$;

create or replace function public.post_asiento_manual(e public.events, p_date date, p_period uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.manual_entries;
begin
  select * into m from public.manual_entries where event_id = e.id;
  return public.post_entry(p_date, p_period, 'Asiento manual: ' || m.reason, e.id,
    (select jsonb_agg(jsonb_build_object(
              'account_id', l ->> 'account_id',
              'debit', coalesce((l ->> 'debit_cents')::bigint, 0),
              'credit', coalesce((l ->> 'credit_cents')::bigint, 0),
              'member_id', nullif(l ->> 'member_id', ''),
              'project_id', coalesce(nullif(l ->> 'project_id', ''), e.project_id::text),
              'memo', nullif(l ->> 'memo', '')))
     from jsonb_array_elements(m.lines) l),
    null, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre y reapertura de mes
-- ---------------------------------------------------------------------------
-- Lo que conviene revisar antes de cerrar un mes.
create or replace function public.period_checklist(p_year integer, p_month integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with range as (
    select make_date(p_year, p_month, 1) as d1, (make_date(p_year, p_month, 1) + interval '1 month')::date as d2,
           (select timezone from public.app_settings where id) as tz
  )
  select case when not public.is_active_member() then null else jsonb_build_object(
    'status', coalesce((select status::text from public.periods where year = p_year and month = p_month), 'abierto'),
    'ended', (select d2 <= (now() at time zone tz)::date from range),
    'shows_sin_cerrar', (select count(*) from public.shows s, range r
                         where s.status = 'programado' and s.date >= r.d1 and s.date < r.d2),
    'entregas_sin_confirmar', (select count(*) from public.events e, range r
                               where e.status = 'pendiente_confirmacion'
                                 and (e.captured_at at time zone r.tz)::date >= r.d1
                                 and (e.captured_at at time zone r.tz)::date < r.d2),
    'arqueos', (select count(*) from public.cash_counts c join public.events e on e.id = c.event_id, range r
                where e.status = 'registrado' and (e.captured_at at time zone r.tz)::date >= r.d1
                  and (e.captured_at at time zone r.tz)::date < r.d2),
    'asientos', (select count(*) from public.journal_entries j, range r where j.date >= r.d1 and j.date < r.d2)
  ) end;
$$;

create or replace function public.close_period(p_year integer, p_month integer)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.periods;
  v_today date;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador cierra el mes' using errcode = '42501';
  end if;
  select (now() at time zone timezone)::date into v_today from public.app_settings where id;
  if (make_date(p_year, p_month, 1) + interval '1 month')::date > v_today then
    raise exception 'Ese mes todavía no termina' using errcode = 'P0001';
  end if;
  insert into public.periods (year, month) values (p_year, p_month) on conflict (year, month) do nothing;
  update public.periods
  set status = 'cerrado', closed_by = (select auth.uid()), closed_at = now()
  where year = p_year and month = p_month
  returning * into v;
  perform public.log_audit('period.close', 'periods', v.id::text,
    jsonb_build_object('year', p_year, 'month', p_month), null);
  return v;
end;
$$;

create or replace function public.reopen_period(p_year integer, p_month integer, p_reason text)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.periods;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador reabre el mes' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Explica por qué reabres el mes' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.year_closings where year = p_year) then
    raise exception 'Ese año ya está cerrado' using errcode = 'P0001';
  end if;
  update public.periods
  set status = 'abierto', reopen_reason = btrim(p_reason)
  where year = p_year and month = p_month and status = 'cerrado'
  returning * into v;
  if v.id is null then
    raise exception 'Ese mes no está cerrado' using errcode = 'P0001';
  end if;
  perform public.log_audit('period.reopen', 'periods', v.id::text,
    jsonb_build_object('year', p_year, 'month', p_month, 'reason', btrim(p_reason)), null);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre de año: las cuentas de resultados (4 a 7) se saldan contra 3.4 y el
-- resultado pasa a 3.3 Resultados acumulados, con fecha 31 de diciembre.
-- ---------------------------------------------------------------------------
create or replace function public.close_year(p_year integer)
returns public.year_closings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.year_closings;
  v_today date;
  v_period uuid;
  v_lines jsonb := '[]'::jsonb;
  v_result bigint := 0;
  v_entry uuid;
  r record;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador cierra el año' using errcode = '42501';
  end if;
  select (now() at time zone timezone)::date into v_today from public.app_settings where id;
  if make_date(p_year, 12, 31) >= v_today then
    raise exception 'Ese año todavía no termina' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.year_closings where year = p_year) then
    raise exception 'Ese año ya está cerrado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.periods where year = p_year and status = 'abierto')
     and exists (select 1 from public.journal_entries j join public.periods p on p.id = j.period_id
                 where p.year = p_year and p.status = 'abierto') then
    raise exception 'Primero cierra todos los meses de ese año' using errcode = 'P0001';
  end if;

  for r in
    select a.id, sum(l.credit_cents - l.debit_cents)::bigint as balance
    from public.journal_lines l
    join public.journal_entries j on j.id = l.entry_id
    join public.accounts a on a.id = l.account_id
    where a.type in ('ingreso', 'costo', 'gasto', 'otro')
      and j.date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
    group by a.id
    having sum(l.credit_cents - l.debit_cents) <> 0
  loop
    -- Saldo acreedor (ingreso) se carga; saldo deudor (gasto) se abona.
    v_lines := v_lines || public.jl(r.id, greatest(r.balance, 0), greatest(-r.balance, 0));
    v_result := v_result + r.balance;
  end loop;
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Ese año no tiene resultados que cerrar' using errcode = 'P0001';
  end if;
  -- Contra 3.4 Resultado del ejercicio, y de ahí a 3.3 Resultados acumulados.
  v_lines := v_lines
    || public.jl(public.account_id('3.4'), greatest(-v_result, 0), greatest(v_result, 0))
    || public.jl(public.account_id('3.4'), greatest(v_result, 0), greatest(-v_result, 0))
    || public.jl(public.account_id('3.3'), greatest(-v_result, 0), greatest(v_result, 0));

  insert into public.periods (year, month, status) values (p_year, 12, 'cerrado')
  on conflict (year, month) do nothing;
  select id into v_period from public.periods where year = p_year and month = 12;
  v_entry := public.post_entry(make_date(p_year, 12, 31), v_period,
    'Cierre del ejercicio ' || p_year, null, v_lines, null, true);

  insert into public.year_closings (year, entry_id, result_cents, closed_by)
  values (p_year, v_entry, v_result, (select auth.uid()))
  returning * into v;
  perform public.log_audit('year.close', 'year_closings', p_year::text,
    jsonb_build_object('result_cents', v_result), null);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ajustes y catálogos editables (contador)
-- ---------------------------------------------------------------------------
create or replace function public.set_intern_salary(p_cents bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_contador() then
    raise exception 'Solo el contador cambia el sueldo del becario' using errcode = '42501';
  end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000000 then
    raise exception 'El monto no es válido' using errcode = 'P0001';
  end if;
  update public.app_settings set intern_salary_cents = p_cents, updated_at = now(),
    updated_by = (select auth.uid()) where id;
  return p_cents;
end;
$$;

-- Cuenta del catálogo: alta (el padre sale del código) o cambio de nombre y de activa.
create or replace function public.save_account(p jsonb)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
  v_code text := btrim(p ->> 'code');
  v_parent uuid;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador edita el catálogo de cuentas' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p ->> 'name', ''))) = 0 then
    raise exception 'Ponle nombre a la cuenta' using errcode = 'P0001';
  end if;

  if nullif(p ->> 'id', '') is not null then
    update public.accounts
    set name = btrim(p ->> 'name'), active = coalesce((p ->> 'active')::boolean, active)
    where id = (p ->> 'id')::uuid and member_id is null
    returning * into v;
    if v.id is null then
      raise exception 'Esa cuenta no se puede editar' using errcode = 'P0001';
    end if;
  else
    if v_code !~ '^[0-9]+(\.[0-9]+)+$' then
      raise exception 'El código va con puntos, por ejemplo 6.12' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.accounts where code = v_code) then
      raise exception 'Ya existe una cuenta con ese código' using errcode = 'P0001';
    end if;
    select id into v_parent from public.accounts
    where code = regexp_replace(v_code, '\.[0-9]+$', '') and member_id is null;
    if v_parent is null then
      raise exception 'No existe la cuenta de la que cuelga ese código' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.journal_lines where account_id = v_parent) then
      raise exception 'La cuenta de arriba ya tiene movimientos: usa otro código' using errcode = 'P0001';
    end if;
    update public.accounts set is_postable = false where id = v_parent;
    insert into public.accounts (code, name, type, nature, parent_id, created_by)
    select v_code, btrim(p ->> 'name'), a.type, a.nature, a.id, (select auth.uid())
    from public.accounts a where a.id = v_parent
    returning * into v;
  end if;
  perform public.log_audit('account.save', 'accounts', v.id::text, to_jsonb(v), null);
  return v;
end;
$$;

create or replace function public.save_category(p jsonb)
returns public.categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.categories;
  v_general uuid := public.account_id(p ->> 'account_general_code');
  v_show uuid := public.account_id(nullif(p ->> 'account_show_code', ''));
begin
  if not public.is_contador() then
    raise exception 'Solo el contador edita las categorías' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p ->> 'name', ''))) = 0 then
    raise exception 'Ponle nombre a la categoría' using errcode = 'P0001';
  end if;
  if v_general is null or not (select is_postable from public.accounts where id = v_general) then
    raise exception 'Elige la cuenta de la categoría' using errcode = 'P0001';
  end if;

  if nullif(p ->> 'id', '') is not null then
    update public.categories
    set name = btrim(p ->> 'name'), emoji = coalesce(nullif(btrim(p ->> 'emoji'), ''), emoji),
        account_general_id = v_general, account_show_id = v_show,
        sort = coalesce((p ->> 'sort')::integer, sort),
        is_extra = coalesce((p ->> 'is_extra')::boolean, is_extra),
        visible_to = coalesce((p ->> 'visible_to')::public.visible_to, visible_to),
        active = coalesce((p ->> 'active')::boolean, active)
    where id = (p ->> 'id')::uuid
    returning * into v;
    if v.id is null then
      raise exception 'Esa categoría no existe' using errcode = 'P0001';
    end if;
  else
    insert into public.categories
      (slug, name, emoji, kind, account_show_id, account_general_id, sort, is_extra, visible_to, created_by)
    values ('cat-' || replace(gen_random_uuid()::text, '-', ''), btrim(p ->> 'name'),
            coalesce(nullif(btrim(p ->> 'emoji'), ''), '🧾'), (p ->> 'kind')::public.category_kind,
            v_show, v_general, coalesce((p ->> 'sort')::integer, 500),
            coalesce((p ->> 'is_extra')::boolean, true),
            coalesce((p ->> 'visible_to')::public.visible_to, 'todos'), (select auth.uid()))
    returning * into v;
  end if;
  perform public.log_audit('category.save', 'categories', v.id::text, to_jsonb(v), null);
  return v;
end;
$$;

create or replace function public.save_project_type(p jsonb)
returns public.project_types
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.project_types;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador edita los tipos de proyecto' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p ->> 'name', ''))) = 0 then
    raise exception 'Ponle nombre al tipo' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'id', '') is not null then
    update public.project_types
    set name = btrim(p ->> 'name'), emoji = coalesce(nullif(btrim(p ->> 'emoji'), ''), emoji),
        sort = coalesce((p ->> 'sort')::integer, sort)
    where id = (p ->> 'id')::uuid
    returning * into v;
    if v.id is null then
      raise exception 'Ese tipo no existe' using errcode = 'P0001';
    end if;
  else
    if upper(btrim(coalesce(p ->> 'code', ''))) !~ '^[A-Z]{3}$' then
      raise exception 'La clave son 3 letras, por ejemplo VID' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.project_types where code = upper(btrim(p ->> 'code'))) then
      raise exception 'Ya existe un tipo con esa clave' using errcode = 'P0001';
    end if;
    insert into public.project_types (code, name, emoji, is_show, sort)
    values (upper(btrim(p ->> 'code')), btrim(p ->> 'name'), coalesce(nullif(btrim(p ->> 'emoji'), ''), '📁'),
            coalesce((p ->> 'is_show')::boolean, false), coalesce((p ->> 'sort')::integer, 500))
    returning * into v;
  end if;
  return v;
end;
$$;

-- Contactos (venues, proveedores, terceros): los da de alta cualquier integrante.
create or replace function public.save_contact(p jsonb)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.contacts;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p ->> 'name', ''))) = 0 then
    raise exception 'Ponle nombre al contacto' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'id', '') is not null then
    update public.contacts
    set name = btrim(p ->> 'name'), kind = coalesce((p ->> 'kind')::public.contact_kind, kind),
        city = nullif(btrim(p ->> 'city'), ''), phone = nullif(btrim(p ->> 'phone'), ''),
        notes = nullif(btrim(p ->> 'notes'), '')
    where id = (p ->> 'id')::uuid
    returning * into v;
    if v.id is null then
      raise exception 'Ese contacto no existe' using errcode = 'P0001';
    end if;
  else
    insert into public.contacts (name, kind, city, phone, notes, created_by)
    values (btrim(p ->> 'name'), coalesce((p ->> 'kind')::public.contact_kind, 'otro'),
            nullif(btrim(p ->> 'city'), ''), nullif(btrim(p ->> 'phone'), ''),
            nullif(btrim(p ->> 'notes'), ''), (select auth.uid()))
    returning * into v;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reportes: los de resultados pueden dejar fuera el asiento de cierre de año
-- ---------------------------------------------------------------------------
drop function public.report_account_totals(date, date, uuid, uuid);
create function public.report_account_totals(
  p_from date default null, p_to date default null, p_project uuid default null, p_show uuid default null,
  p_include_closing boolean default true
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
    -- El asiento de cierre de año deja en ceros las cuentas de resultados; los
    -- reportes de resultados lo dejan fuera para seguir mostrando el año.
    and (p_include_closing or not exists (select 1 from public.year_closings y where y.entry_id = j.id))
  group by a.id;
$$;

-- Repartos pendientes de pago por integrante.
create view public.v_distributions_payable with (security_invoker = true) as
select p.id as member_id, p.display_name, p.emoji,
       coalesce((select sum(l.credit_cents - l.debit_cents)
                 from public.accounts a join public.journal_lines l on l.account_id = a.id
                 where a.member_id = p.id and a.member_kind = 'reparto_por_pagar'), 0)::bigint as payable_cents,
       public.pending_compensation(p.id) as compensation_cents
from public.profiles p
where p.participa_reparto;

create view public.v_periods with (security_invoker = true) as
select p.id, p.year, p.month, p.status, p.closed_at, p.reopen_reason,
       (select count(*) from public.journal_entries j where j.period_id = p.id) as entries,
       exists (select 1 from public.year_closings y where y.year = p.year) as year_closed
from public.periods p;

revoke all on public.v_distributions_payable, public.v_periods from anon, authenticated;
grant select on public.v_distributions_payable, public.v_periods to authenticated;

-- ---------------------------------------------------------------------------
-- Los tipos nuevos entran al registro general de capturas y al feed
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
    when 'reparto' then public.post_reparto(e, v_date, v_period)
    when 'pago_reparto' then public.post_pago_reparto(e, v_date, v_period)
    when 'arqueo' then public.post_arqueo(e, v_date, v_period)
    when 'asiento_manual' then public.post_asiento_manual(e, v_date, v_period)
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
                        'viaje', 'arqueo', 'asiento_manual');
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

    when 'reparto', 'pago_reparto', 'arqueo', 'asiento_manual' then
      perform public.insert_admin_detail(v_event, p_type, p_payload, v_uid, v_contador, v_amount);

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

create or replace view public.v_event_feed with (security_invoker = true) as
select e.id, e.client_id, e.type, e.status, e.captured_at, e.created_at, e.created_by,
       e.project_id, e.note, e.void_reason,
       coalesce(x.amount_cents, i.amount_cents, t.amount_cents, f.amount_cents, s.amount_cents,
                sd.total_cents, pd.total_cents, sa.cost_cents, st.income_cents, adv.amount_cents,
                rc.amount_cents, tr.total_cents, tp.amount_cents,
                di.total_cents, dp.amount_cents, abs(cc.diff_cents), me.total_cents) as amount_cents,
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
       tp.from_member as pay_from, tp.to_member as pay_to,
       coalesce(dp.member_id, cc.member_id) as admin_member, cc.diff_cents as count_diff,
       cc.place as count_place, me.reason as manual_reason
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
left join public.distributions di on di.event_id = e.id
left join public.distribution_payments dp on dp.event_id = e.id
left join public.cash_counts cc on cc.event_id = e.id
left join public.manual_entries me on me.event_id = e.id
left join public.categories c on c.id = coalesce(x.category_id, i.category_id);

revoke all on public.v_event_feed from anon, authenticated;
grant select on public.v_event_feed to authenticated;

-- Permisos: nada es ejecutable por el cliente salvo esta lista.
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
  public.report_account_totals(date, date, uuid, uuid, boolean),
  public.report_cash_flow(date, date, uuid),
  public.report_merch(date, date),
  public.report_ledger(uuid, date, date),
  public.save_vehicle(uuid, uuid, text, public.fuel_type, numeric, boolean),
  public.save_place(uuid, text, text, boolean),
  public.set_transport_rates(bigint, bigint, bigint, bigint),
  public.pending_compensation(uuid),
  public.distribution_preview(bigint),
  public.period_checklist(integer, integer),
  public.close_period(integer, integer),
  public.reopen_period(integer, integer, text),
  public.close_year(integer),
  public.set_intern_salary(bigint),
  public.save_account(jsonb),
  public.save_category(jsonb),
  public.save_project_type(jsonb),
  public.save_contact(jsonb)
to authenticated;

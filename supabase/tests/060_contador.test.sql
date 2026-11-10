begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación: un contador y dos integrantes; solo ellos participan en repartos
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-ra@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-rb@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-rc@caja.moodra.mx');
update public.profiles set role = 'contador' where username = 'pgtap-ra';
update public.profiles set participa_reparto = (username like 'pgtap-r%');

create function pg_temp.uid(p text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-r' || p $$;
create function pg_temp.act(p text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true) $$;
create function pg_temp.cat(p_slug text) returns uuid language sql as
$$ select id from public.categories where slug = p_slug $$;
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select id from ids where k = p_k $$;
create function pg_temp.ev(p_type text, p_payload jsonb, p_when timestamptz default now()) returns uuid
language sql as
$$ select (public.submit_event(gen_random_uuid(), p_type::public.event_type, p_payload, p_when) ->> 'event_id')::uuid $$;
-- Movimiento de una cuenta (cargos − abonos) en el asiento de un evento.
create function pg_temp.mov(p_event uuid, p_code text) returns bigint language sql as
$$ select coalesce(sum(l.debit_cents - l.credit_cents), 0)::bigint
   from public.journal_lines l
   join public.journal_entries j on j.id = l.entry_id
   join public.accounts a on a.id = l.account_id
   where j.source_event_id = p_event and j.reverses_entry_id is null and a.code = p_code $$;
create function pg_temp.pagar(p text) returns bigint language sql as
$$ select payable_cents from public.v_distributions_payable where member_id = pg_temp.uid(p) $$;
create function pg_temp.codigo(p text, p_kind text) returns text language sql as
$$ select code from public.accounts where member_id = pg_temp.uid(p) and member_kind = p_kind::public.member_account_kind $$;

-- Dinero en la cuenta, un préstamo y un gasto "descuéntalo del próximo reparto".
select pg_temp.act('a');
select pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 900000, 'destination', 'cuenta_banda', 'kind', 'aportacion'));
select pg_temp.act('b');
select pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 100000, 'destination', 'cuenta_banda', 'kind', 'prestamo'));
select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 30000, 'category_id', pg_temp.cat('transporte'),
  'paid_with', 'mi_dinero', 'settlement_pref', 'compensar_reparto'));
select pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 50000, 'category_id', pg_temp.cat('show-en-vivo'),
  'destination', 'efectivo_integrante'));

-- ---------------------------------------------------------------------------
-- Repartos
-- ---------------------------------------------------------------------------
select is(public.pending_compensation(pg_temp.uid('b')), 30000::bigint, 'B tiene $300 por cobrar con el reparto');
select results_eq(
  $$ select gross_cents, compensation_cents, net_cents from public.distribution_preview(100000) order by member_id $$,
  $$ values (33334::bigint, 0::bigint, 33334::bigint), (33333, 30000, 63333), (33333, 0, 33333) $$,
  'vista previa: partes iguales, el centavo extra al primero y la compensación de B');

select throws_ok($$ select pg_temp.ev('reparto', jsonb_build_object('amount_cents', 100000)) $$, '42501', null,
  'un integrante no hace repartos');
select pg_temp.act('a');
insert into ids select 'rep', pg_temp.ev('reparto', jsonb_build_object('amount_cents', 100000, 'note', 'Gira pgTAP'));
select is(pg_temp.pagar('a'), 33334::bigint, 'reparto por pagar a A');
select is(pg_temp.pagar('b'), 63333::bigint, 'a B: su parte más lo que pidió cobrar con el reparto');
select is(pg_temp.pagar('c'), 33333::bigint, 'reparto por pagar a C');
select is(pg_temp.mov(pg_temp.id('rep'), pg_temp.codigo('b', 'repartos')), 33333::bigint, 'D 3.2.x por la parte de B');
select is(pg_temp.mov(pg_temp.id('rep'), pg_temp.codigo('b', 'por_regresar')), 30000::bigint,
  'la compensación sale de lo que se le debía');
select is(public.pending_compensation(pg_temp.uid('b')), 0::bigint, 'ya no queda compensación pendiente');
select is((select amount_cents from public.v_event_feed where id = pg_temp.id('rep')), 100000::bigint, 'el feed trae el reparto');

select throws_ok($$ select pg_temp.ev('pago_reparto', jsonb_build_object('amount_cents', 40000,
  'member_id', pg_temp.uid('c'), 'origin', 'cuenta_banda')) $$, 'P0001', null, 'no se paga más de lo pendiente');
insert into ids select 'pago', pg_temp.ev('pago_reparto', jsonb_build_object('amount_cents', 63333,
  'member_id', pg_temp.uid('b'), 'origin', 'cuenta_banda'));
select is(pg_temp.pagar('b'), 0::bigint, 'B quedó pagado');
select is(pg_temp.mov(pg_temp.id('pago'), '1.2.01'), -63333::bigint, 'salió de la cuenta de la banda');
select pg_temp.act('b');
select throws_ok($$ select pg_temp.ev('pago_reparto', jsonb_build_object('amount_cents', 100,
  'member_id', pg_temp.uid('c'), 'origin', 'cuenta_banda')) $$, '42501', null, 'un integrante no paga repartos');

-- ---------------------------------------------------------------------------
-- Arqueos de efectivo
-- ---------------------------------------------------------------------------
insert into ids select 'arq1', pg_temp.ev('arqueo', jsonb_build_object('place', 'efectivo_integrante', 'counted_cents', 45000));
select is((select diff_cents from public.cash_counts where event_id = pg_temp.id('arq1')), -5000::bigint,
  'B traía $500 y contó $450: faltan $50');
select is(pg_temp.mov(pg_temp.id('arq1'), '7.3'), 5000::bigint, 'el faltante va a diferencias de caja');
select is(public.account_balance(public.member_account(pg_temp.uid('b'), 'efectivo')), 45000::bigint,
  'su efectivo queda en lo contado');
insert into ids select 'arq2', pg_temp.ev('arqueo', jsonb_build_object('place', 'efectivo_integrante', 'counted_cents', 45000));
select is((select journal_entry_id from public.events where id = pg_temp.id('arq2')), null, 'si cuadra no hay asiento');
select is((select status::text from public.events where id = pg_temp.id('arq2')), 'registrado', 'pero el arqueo queda registrado');
select throws_ok($$ select pg_temp.ev('arqueo', jsonb_build_object('place', 'caja', 'counted_cents', 0)) $$,
  '42501', null, 'un integrante no cuenta la caja');
select pg_temp.act('c');
select throws_ok($$ select pg_temp.ev('arqueo', jsonb_build_object('place', 'efectivo_integrante',
  'member_id', pg_temp.uid('b'), 'counted_cents', 0)) $$, '42501', null, 'ni el efectivo de otro');
select pg_temp.act('a');
insert into ids select 'arq3', pg_temp.ev('arqueo', jsonb_build_object('place', 'caja',
  'counted_cents', public.account_balance(public.account_id('1.1.01')) + 2000));
select is(pg_temp.mov(pg_temp.id('arq3'), '7.3'), -2000::bigint, 'un sobrante de caja se abona a diferencias');
select is(pg_temp.mov(pg_temp.id('arq3'), '1.1.01'), 2000::bigint, 'y sube la caja');

-- ---------------------------------------------------------------------------
-- Asiento manual
-- ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.ev('asiento_manual', jsonb_build_object('reason', 'Comisión del banco',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', public.account_id('7.4'), 'debit_cents', 15000),
    jsonb_build_object('account_id', public.account_id('1.2.01'), 'credit_cents', 14000)))) $$,
  'P0001', null, 'un asiento que no cuadra no entra');
select throws_ok($$ select pg_temp.ev('asiento_manual', jsonb_build_object('reason', 'x',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', public.account_id('7.4'), 'debit_cents', 15000),
    jsonb_build_object('account_id', public.account_id('1.2.01'), 'credit_cents', 15000)))) $$,
  'P0001', null, 'ni sin motivo');
select throws_ok($$ select pg_temp.ev('asiento_manual', jsonb_build_object('reason', 'Comisión del banco',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', public.account_id('7'), 'debit_cents', 15000),
    jsonb_build_object('account_id', public.account_id('1.2.01'), 'credit_cents', 15000)))) $$,
  'P0001', null, 'ni a una cuenta que no admite movimientos');
insert into ids select 'man', pg_temp.ev('asiento_manual', jsonb_build_object('reason', 'Comisión del banco',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', public.account_id('7.4'), 'debit_cents', 15000, 'memo', 'noviembre'),
    jsonb_build_object('account_id', public.account_id('1.2.01'), 'credit_cents', 15000))));
select is(pg_temp.mov(pg_temp.id('man'), '7.4'), 15000::bigint, 'asiento manual registrado');
select is((select is_manual from public.journal_entries where source_event_id = pg_temp.id('man') and reverses_entry_id is null),
  true, 'marcado como manual');
select lives_ok($$ select public.void_event(pg_temp.id('man'), 'se capturó dos veces') $$, 'y se puede anular');
select pg_temp.act('b');
select throws_ok($$ select pg_temp.ev('asiento_manual', jsonb_build_object('reason', 'Comisión del banco',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', public.account_id('7.4'), 'debit_cents', 100),
    jsonb_build_object('account_id', public.account_id('1.2.01'), 'credit_cents', 100)))) $$,
  '42501', null, 'un integrante no captura asientos manuales');

-- ---------------------------------------------------------------------------
-- Cierre y reapertura de mes
-- ---------------------------------------------------------------------------
create function pg_temp.hace(p_days integer) returns date language sql as
$$ select ((now() - make_interval(days => p_days)) at time zone 'America/Mexico_City')::date $$;

select throws_ok($$ select public.close_period(extract(year from pg_temp.hace(100))::int,
  extract(month from pg_temp.hace(100))::int) $$, '42501', null, 'un integrante no cierra el mes');
select pg_temp.act('a');
select throws_ok($$ select public.close_period(extract(year from pg_temp.hace(0))::int,
  extract(month from pg_temp.hace(0))::int) $$, 'P0001', null, 'el mes en curso no se cierra');
select is((public.close_period(extract(year from pg_temp.hace(100))::int,
  extract(month from pg_temp.hace(100))::int)).status::text, 'cerrado', 'un mes que ya terminó se cierra');
select ok((public.period_checklist(extract(year from pg_temp.hace(100))::int,
  extract(month from pg_temp.hace(100))::int)) ?& array['status', 'shows_sin_cerrar', 'entregas_sin_confirmar', 'arqueos'],
  'la lista de revisión trae sus datos');
select throws_ok($$ select public.reopen_period(extract(year from pg_temp.hace(100))::int,
  extract(month from pg_temp.hace(100))::int, 'x') $$, 'P0001', null, 'reabrir pide un motivo');
select is((public.reopen_period(extract(year from pg_temp.hace(100))::int,
  extract(month from pg_temp.hace(100))::int, 'Faltó un gasto de la gira')).status::text, 'abierto', 'se reabre con motivo');
select is((select count(*)::int from public.audit_log where action in ('period.close', 'period.reopen')
           and actor = pg_temp.uid('a')), 2, 'cierre y reapertura quedan en la bitácora');

-- ---------------------------------------------------------------------------
-- Cierre de año (el año pasado)
-- ---------------------------------------------------------------------------
create function pg_temp.anio() returns integer language sql as
$$ select extract(year from pg_temp.hace(0))::int - 1 $$;
create function pg_temp.resultado(p_closing boolean) returns bigint language sql as
$$ select coalesce(sum(case when type = 'ingreso' then credit_cents - debit_cents else -(debit_cents - credit_cents) end), 0)::bigint
   from public.report_account_totals(make_date(pg_temp.anio(), 1, 1), make_date(pg_temp.anio(), 12, 31), null, null, p_closing)
   where type in ('ingreso', 'costo', 'gasto', 'otro') $$;

select pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 200000, 'category_id', pg_temp.cat('show-en-vivo'),
  'destination', 'cuenta_banda'), make_timestamptz(pg_temp.anio(), 6, 15, 12, 0, 0, 'America/Mexico_City'));
select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 50000, 'category_id', pg_temp.cat('promo'),
  'paid_with', 'cuenta_banda'), make_timestamptz(pg_temp.anio(), 6, 15, 12, 0, 0, 'America/Mexico_City'));
create temp table antes as select pg_temp.resultado(false) as resultado;
grant all on antes to public;

select throws_ok($$ select public.close_year(pg_temp.anio() + 1) $$, 'P0001', null, 'el año en curso no se cierra');
select throws_ok($$ select public.close_year(pg_temp.anio()) $$, 'P0001', null, 'primero hay que cerrar sus meses');
select public.close_period(year, month) from public.periods where year = pg_temp.anio() and status = 'abierto';
select is((public.close_year(pg_temp.anio())).result_cents, (select resultado from antes),
  'el cierre de año pasa el resultado del ejercicio');
select is(pg_temp.resultado(true), 0::bigint, 'con el cierre, las cuentas de resultados del año quedan en cero');
select is(pg_temp.resultado(false), (select resultado from antes), 'y el reporte de resultados sigue mostrando el año');
select is((select sum(l.credit_cents - l.debit_cents) from public.journal_lines l
           join public.year_closings y on y.entry_id = l.entry_id
           where y.year = pg_temp.anio() and l.account_id = public.account_id('3.3')),
  (select resultado from antes)::numeric, 'el resultado quedó en resultados acumulados');
select throws_ok($$ select public.close_year(pg_temp.anio()) $$, 'P0001', null, 'un año no se cierra dos veces');
select throws_ok($$ select public.reopen_period(pg_temp.anio(), 6, 'ya no se puede') $$, 'P0001', null,
  'ni se reabren sus meses');

-- ---------------------------------------------------------------------------
-- Catálogos y ajustes
-- ---------------------------------------------------------------------------
select is((public.save_account(jsonb_build_object('code', '6.12', 'name', 'Mensajería pgTAP'))).type::text, 'gasto',
  'una cuenta nueva hereda el tipo de la que cuelga');
select throws_ok($$ select public.save_account(jsonb_build_object('code', '6.12', 'name', 'Otra')) $$, 'P0001', null,
  'el código no se repite');
select throws_ok($$ select public.save_account(jsonb_build_object('code', '9.1', 'name', 'Sin padre')) $$, 'P0001', null,
  'ni cuelga de una cuenta que no existe');
select is((public.save_account(jsonb_build_object('id', public.account_id('6.12'), 'name', 'Mensajería'))).name,
  'Mensajería', 'se renombra');
insert into ids select 'cat', (public.save_category(jsonb_build_object('name', 'Mensajería pgTAP', 'emoji', '📦',
  'kind', 'gasto', 'account_general_code', '6.12'))).id;
insert into ids select 'gcat', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 12000,
  'category_id', pg_temp.id('cat'), 'paid_with', 'cuenta_banda'));
select is(pg_temp.mov(pg_temp.id('gcat'), '6.12'), 12000::bigint, 'la categoría nueva manda a su cuenta');
select is((public.save_project_type(jsonb_build_object('code', 'zzz', 'name', 'Tipo pgTAP'))).code, 'ZZZ', 'tipo de proyecto nuevo');
select throws_ok($$ select public.save_project_type(jsonb_build_object('code', 'ZZZ', 'name', 'Repetido')) $$,
  'P0001', null, 'la clave no se repite');
select is(public.set_intern_salary(750000), 750000::bigint, 'el contador cambia el sueldo del becario');

select pg_temp.act('b');
select throws_ok($$ select public.save_account(jsonb_build_object('code', '6.13', 'name', 'X')) $$, '42501', null,
  'un integrante no edita cuentas');
select throws_ok($$ select public.save_category(jsonb_build_object('name', 'X', 'kind', 'gasto',
  'account_general_code', '6.99')) $$, '42501', null, 'ni categorías');
select throws_ok($$ select public.set_intern_salary(1) $$, '42501', null, 'ni el sueldo del becario');
select is((public.save_contact(jsonb_build_object('name', 'Foro pgTAP', 'kind', 'venue', 'city', 'CDMX'))).kind::text,
  'venue', 'cualquier integrante da de alta un contacto');

-- Todo sigue cuadrado y las funciones internas están cerradas.
select is((select sum(debit_cents) from public.journal_lines), (select sum(credit_cents) from public.journal_lines),
  'cargos = abonos en todo el diario');
select is(has_function_privilege('authenticated', 'public.post_reparto(public.events, date, uuid)', 'execute'), false,
  'post_reparto no es ejecutable por el cliente');
select is(has_function_privilege('anon', 'public.close_year(integer)', 'execute'), false,
  'sin sesión no se cierra nada');

select * from finish();
rollback;

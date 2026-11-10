begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-diego@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-pepe@caja.moodra.mx');
update public.profiles set role = 'contador' where username = 'pgtap-diego';

create function pg_temp.uid(p_username text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-' || p_username $$;
create function pg_temp.act(p_username text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p_username), 'role', 'authenticated')::text, true) $$;
create function pg_temp.ev(p_type text, p_payload jsonb) returns uuid language sql as
$$ select (public.submit_event(gen_random_uuid(), p_type::public.event_type, p_payload, now())
           ->> 'event_id')::uuid $$;
create function pg_temp.lines(p_entry uuid) returns text language sql as
$$ select string_agg(
     coalesce(a.member_kind::text || '@' || replace(p.username, 'pgtap-', ''), a.code)
       || case when l.debit_cents > 0 then ' D' || l.debit_cents else ' C' || l.credit_cents end,
     ' | ' order by (l.credit_cents > 0), a.code, (l.debit_cents + l.credit_cents) desc)
   from public.journal_lines l
   join public.accounts a on a.id = l.account_id
   left join public.profiles p on p.id = a.member_id
   where l.entry_id = p_entry $$;
create function pg_temp.asiento(p_event uuid) returns text language sql as
$$ select pg_temp.lines((select journal_entry_id from public.events where id = p_event)) $$;
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select id from ids where k = p_k $$;
create function pg_temp.cat(p_slug text) returns uuid language sql as
$$ select id from public.categories where slug = p_slug $$;
create function pg_temp.estado(p_k text) returns text language sql as
$$ select status::text from public.shows where id = pg_temp.id(p_k) $$;

-- ---------------------------------------------------------------------------
-- A. Plataformas de boletaje
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.ticket_platforms where name in ('Passline', 'Plataforma propia (amigo)')), 2,
  'las dos plataformas vienen sembradas');
select is((select commission_pct::text || '/' || settlement_days from public.ticket_platforms where name = 'Passline'),
  '0.00/0', 'Passline arranca sin comisión ni plazo: por configurar');
insert into ids select 'passline', id from public.ticket_platforms where name = 'Passline';
create function pg_temp.cta_passline() returns text language sql as
$$ select a.code from public.ticket_platforms p join public.accounts a on a.id = p.account_id
   where p.name = 'Passline' $$;
select matches(pg_temp.cta_passline(), '^1\.3\.02\.[0-9]{2}$', 'cada plataforma tiene su subcuenta por cobrar');

select pg_temp.act('pepe');
select throws_ok($$ select public.save_ticket_platform(jsonb_build_object('name', 'Otra')) $$, '42501', null,
  'un integrante no edita plataformas');
select pg_temp.act('diego');
select lives_ok($$ select public.save_ticket_platform(jsonb_build_object('id', pg_temp.id('passline'),
    'name', 'Passline', 'commission_pct', 10, 'commission_fixed_cents', 500, 'bearer', 'banda',
    'settlement_days', 7)) $$, 'el contador configura comisión, quién la absorbe y plazo');

-- ---------------------------------------------------------------------------
-- B. Shows y su ingreso esperado
-- ---------------------------------------------------------------------------
insert into ids select 'gira', (public.create_project('GIR', 'Bajío pgTAP')).id;
select pg_temp.act('pepe');
insert into ids select 'A', public.save_show(jsonb_build_object('name', 'Foro A', 'date', current_date,
  'deal_type', 'fee_fijo', 'fee_cents', 800000, 'project_id', pg_temp.id('gira'), 'city', 'León'));
insert into ids select 'B', public.save_show(jsonb_build_object('name', 'Foro B', 'date', current_date,
  'deal_type', 'porcentaje_taquilla', 'percentage', 70, 'ticket_price_cents', 20000, 'expected_tickets', 100,
  'project_id', pg_temp.id('gira')));
insert into ids select 'C', public.save_show(jsonb_build_object('name', 'Foro C', 'date', current_date,
  'deal_type', 'boletaje_propio', 'ticket_price_cents', 25000, 'expected_tickets', 80,
  'platform_id', pg_temp.id('passline'), 'project_id', pg_temp.id('gira')));
insert into ids select 'D', public.save_show(jsonb_build_object('name', 'Foro D suelto', 'date', current_date,
  'deal_type', 'fee_mas_porcentaje', 'fee_cents', 300000, 'percentage', 50));
insert into ids select 'E', public.save_show(jsonb_build_object('name', 'Tocada gratis', 'date', current_date,
  'deal_type', 'sin_pago'));
insert into ids select 'F', public.save_show(jsonb_build_object('name', 'Puerta propia', 'date', current_date,
  'deal_type', 'boletaje_propio', 'ticket_price_cents', 10000));

select is((select expected_income_cents from public.shows where id = pg_temp.id('A')), 800000::bigint,
  'fee fijo: se espera el fee');
select is((select expected_income_cents from public.shows where id = pg_temp.id('B')), 1400000::bigint,
  '% de taquilla: 100 boletos × $200 × 70 %');
select is((select expected_income_cents from public.shows where id = pg_temp.id('C')), 1760000::bigint,
  'boletaje con comisión a cargo de la banda: bruto − 10 % − $5 por boleto');
select is((select t.code from public.shows s join public.projects p on p.id = s.project_id
           join public.project_types t on t.id = p.type_id where s.id = pg_temp.id('D')), 'SHW',
  'un show sin gira nace con su propio proyecto "Show suelto"');
select is((select count(*)::int from public.shows where project_id = pg_temp.id('gira')), 3, 'la gira agrupa sus 3 shows');
select throws_ok($$ select public.save_show(jsonb_build_object('name', 'Sin fecha', 'deal_type', 'fee_fijo')) $$,
  'P0001', null, 'un show necesita fecha');

-- ---------------------------------------------------------------------------
-- C. A qué show va cada captura
-- ---------------------------------------------------------------------------
insert into ids select 'g-A', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 50000,
  'category_id', pg_temp.cat('transporte'), 'paid_with', 'cuenta_banda', 'show_id', pg_temp.id('A')));
select is((select project_id from public.events where id = pg_temp.id('g-A')), pg_temp.id('gira'),
  'una captura con show hereda su gira');
select is(pg_temp.asiento(pg_temp.id('g-A')), '5.3.01 D50000 | 1.2.01 C50000', 'y usa las cuentas de costo de show');
insert into ids select 'g-gira', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 30000,
  'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda', 'project_id', pg_temp.id('gira')));
select is((select show_id from public.events where id = pg_temp.id('g-gira')), null,
  'un gasto de la gira (con varios shows) queda sin show');
insert into ids select 'g-D', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 20000,
  'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda',
  'project_id', (select project_id from public.shows where id = pg_temp.id('D'))));
select is((select show_id from public.events where id = pg_temp.id('g-D')), pg_temp.id('D'),
  'en un proyecto con un solo show, la captura se le asigna sola');

-- ---------------------------------------------------------------------------
-- D. Anticipo y cierre con fee fijo
-- ---------------------------------------------------------------------------
select is(pg_temp.asiento(pg_temp.ev('anticipo_show', jsonb_build_object('show_id', pg_temp.id('A'),
    'amount_cents', 200000, 'destination', 'cuenta_banda'))),
  '1.2.01 D200000 | 2.3 C200000', 'cobro anticipado: entra el dinero contra cobros anticipados');
insert into ids select 'c-A', pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('A'),
  'fee_cents', 800000, 'destination', 'efectivo_integrante'));
select is(pg_temp.asiento(pg_temp.id('c-A')), 'efectivo@pepe D600000 | 2.3 D200000 | 4.1.01 C800000',
  'cierre con fee fijo: aplica el anticipo y el resto queda en efectivo de quien cobró');
select is(pg_temp.estado('A'), 'cerrado', 'el show queda cerrado');
select throws_ok($$ select pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('A'), 'fee_cents', 1)) $$,
  'P0001', null, 'un show no se cierra dos veces');
select throws_ok($$ select public.save_show(jsonb_build_object('id', pg_temp.id('A'), 'name', 'X',
    'date', current_date, 'deal_type', 'sin_pago')) $$, 'P0001', null, 'un show cerrado no se edita');

-- ---------------------------------------------------------------------------
-- E. % de taquilla pendiente de cobro, y el pago del venue
-- ---------------------------------------------------------------------------
insert into ids select 'c-B', pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('B'),
  'share_cents', 1050000, 'tickets_sold', 75));
select is(pg_temp.asiento(pg_temp.id('c-B')), '1.3.01 D1050000 | 4.1.02 C1050000',
  '% de taquilla sin cobrar: queda por cobrar al venue');
select throws_ok($$ select pg_temp.ev('cobro_pendiente', jsonb_build_object('amount_cents', 9999999,
    'destination', 'cuenta_banda')) $$, 'P0001', null, 'no se cobra más de lo pendiente');
select is(pg_temp.asiento(pg_temp.ev('cobro_pendiente', jsonb_build_object('amount_cents', 1050000,
    'destination', 'cuenta_banda'))),
  '1.2.01 D1050000 | 1.3.01 C1050000', 'llega el pago del venue: se salda el por cobrar');

-- ---------------------------------------------------------------------------
-- F. Boletaje propio por plataforma, y su liquidación
-- ---------------------------------------------------------------------------
insert into ids select 'c-C', pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('C'),
  'gross_cents', 1500000, 'tickets_sold', 60, 'commission_cents', 180000,
  'platform_id', pg_temp.id('passline'), 'destination', 'efectivo_integrante'));
select is(pg_temp.asiento(pg_temp.id('c-C')),
  pg_temp.cta_passline() || ' D1320000 | 5.2 D180000 | 4.1.03 C1500000',
  'boletaje por plataforma con comisión a cargo de la banda: neto por cobrar + comisión contra el bruto');
select is((select pending::text || '/' || coalesce(destination::text, 'sin-destino')
           from public.show_settlements where event_id = pg_temp.id('c-C')), 'true/sin-destino',
  'lo de la boletera queda pendiente aunque se haya indicado un destino');
select is((select balance_cents from public.v_receivables where platform_id = pg_temp.id('passline')),
  1320000::bigint, 'aparece en lo que está por cobrar');
select throws_ok($$ select pg_temp.ev('cobro_pendiente', jsonb_build_object('amount_cents', 1320000,
    'platform_id', pg_temp.id('passline'))) $$, '42501', null,
  'la liquidación de una boletera la registra el contador');
select pg_temp.act('diego');
select is(pg_temp.asiento(pg_temp.ev('cobro_pendiente', jsonb_build_object('amount_cents', 1320000,
    'platform_id', pg_temp.id('passline')))),
  '1.2.01 D1320000 | ' || pg_temp.cta_passline() || ' C1320000',
  'llega la liquidación de Passline a la cuenta');
select is((select count(*)::int from public.v_receivables where platform_id = pg_temp.id('passline')), 0,
  'el por cobrar de la boletera queda saldado');

-- ---------------------------------------------------------------------------
-- G. Fee + porcentaje, sin pago y boletaje en puerta
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
select is(pg_temp.asiento(pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('D'),
    'fee_cents', 300000, 'share_cents', 250000, 'destination', 'cuenta_banda'))),
  '1.2.01 D550000 | 4.1.01 C300000 | 4.1.02 C250000', 'fee más porcentaje: dos ingresos, un solo cobro');
insert into ids select 'c-E', pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('E')));
select is((select status::text || '/' || coalesce(journal_entry_id::text, 'sin-asiento')
           from public.events where id = pg_temp.id('c-E')), 'registrado/sin-asiento',
  'un show sin pago se cierra sin asiento');
select is(pg_temp.estado('E'), 'cerrado', 'y queda cerrado');
select is(pg_temp.asiento(pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('F'),
    'gross_cents', 400000, 'tickets_sold', 40, 'destination', 'efectivo_integrante'))),
  'efectivo@pepe D400000 | 4.1.03 C400000', 'boletaje en puerta cobrado por la banda');

-- ---------------------------------------------------------------------------
-- H. Merch en un show y resultados
-- ---------------------------------------------------------------------------
select pg_temp.act('diego');
insert into ids select 'prod', public.save_product(jsonb_build_object('name', 'Playera pgTAP shows',
  'category', 'playeras', 'variants', jsonb_build_array(jsonb_build_object('label', 'M', 'price_cents', 35000))));
insert into ids select 'M', id from public.product_variants where product_id = pg_temp.id('prod');
select pg_temp.ev('compra_merch', jsonb_build_object('opening', true,
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 10, 'unit_cost_cents', 10000))));
select pg_temp.act('pepe');
select pg_temp.ev('venta_merch', jsonb_build_object('channel', 'show', 'show_id', pg_temp.id('A'),
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 2))));

select is((select show_income_cents || '/' || merch_revenue_cents || '/' || merch_cost_cents || '/'
                  || costs_cents || '/' || net_cents
           from public.v_show_pnl where show_id = pg_temp.id('A')),
  '800000/70000/20000/50000/800000',
  'resultado del show: fee + merch − costo del merch − gastos directos');
select is((select show_income_cents || '/' || merch_revenue_cents || '/' || merch_cost_cents || '/'
                  || costs_cents || '/' || net_cents
           from public.v_project_pnl where project_id = pg_temp.id('gira')),
  '3350000/70000/20000/260000/3140000',
  'resultado de la gira: sus 3 shows, el merch, la comisión y los gastos de gira');
select is((select net_cents from public.v_show_pnl where show_id = pg_temp.id('E')), 0::bigint,
  'un show sin pago ni gastos queda en cero');

-- ---------------------------------------------------------------------------
-- I. Anular un cierre reabre el show y libera el anticipo
-- ---------------------------------------------------------------------------
select is(public.void_event(pg_temp.id('c-A'), 'se capturó mal el fee') ->> 'status', 'anulado',
  'se anula el cierre');
select is(pg_temp.estado('A'), 'programado', 'el show vuelve a quedar abierto');
select is((select show_income_cents from public.v_show_pnl where show_id = pg_temp.id('A')), 0::bigint,
  'y su ingreso por show regresa a cero');
select is(pg_temp.asiento(pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('A'),
    'fee_cents', 900000, 'destination', 'cuenta_banda'))),
  '1.2.01 D700000 | 2.3 D200000 | 4.1.01 C900000',
  'al volver a cerrar, el anticipo se aplica otra vez');
select is((select coalesce(sum(l.credit_cents - l.debit_cents), 0)::bigint from public.journal_lines l
           where l.account_id = public.account_id('2.3') and l.project_id = pg_temp.id('gira')), 0::bigint,
  'los cobros anticipados de la gira quedan en cero');

-- ---------------------------------------------------------------------------
-- J. Contexto activo, cancelación y permisos
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.set_active_context(null, pg_temp.id('B')) $$, 'se puede poner un show como contexto');
select is((select active_project_id::text || '/' || active_show_id::text from public.app_settings),
  pg_temp.id('gira')::text || '/' || pg_temp.id('B')::text, 'el contexto guarda el show y su gira');
select lives_ok($$ select public.set_active_context(null) $$, 'y regresar a operación general');
select is((select coalesce(active_show_id::text, 'ninguno') from public.app_settings), 'ninguno',
  'sin show en el contexto');

insert into ids select 'G', public.save_show(jsonb_build_object('name', 'Se cayó', 'date', current_date,
  'deal_type', 'fee_fijo', 'fee_cents', 100000));
select lives_ok($$ select public.set_show_cancelled(pg_temp.id('G'), true) $$, 'se cancela un show sin cerrar');
select throws_ok($$ select pg_temp.ev('cierre_show', jsonb_build_object('show_id', pg_temp.id('G'), 'fee_cents', 100000)) $$,
  'P0001', null, 'un show cancelado no se cierra');
select throws_ok($$ select public.set_show_cancelled(pg_temp.id('B'), true) $$, 'P0001', null,
  'un show cerrado no se cancela');

select is((select sum(debit_cents) from public.journal_lines), (select sum(credit_cents) from public.journal_lines),
  'el diario cuadra');

set local role authenticated;
select ok((select count(*) from public.v_show_pnl) >= 6, 'un integrante ve el resultado de los shows');
select throws_ok($$ update public.shows set status = 'cerrado' $$, '42501', null,
  'nadie cambia el estado de un show directo');
select throws_ok($$ update public.ticket_platforms set commission_pct = 0 $$, '42501', null,
  'nadie cambia comisiones directo');
select throws_ok($$ select public.insert_show_detail(null, 'cierre_show', '{}'::jsonb, null, false, 0) $$,
  '42501', null, 'las funciones internas de shows no son invocables');
reset role;

select * from finish();
rollback;

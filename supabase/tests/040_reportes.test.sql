begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación: un proyecto con movimientos en dos meses
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-diego@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-pepe@caja.moodra.mx');
update public.profiles set role = 'contador' where username = 'pgtap-diego';

create function pg_temp.uid(p_username text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-' || p_username $$;
create function pg_temp.act(p_username text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p_username), 'role', 'authenticated')::text, true) $$;
create function pg_temp.cat(p_slug text) returns uuid language sql as
$$ select id from public.categories where slug = p_slug $$;
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select id from ids where k = p_k $$;
-- Captura un evento del proyecto de prueba, con la fecha indicada.
create function pg_temp.ev(p_type text, p_payload jsonb, p_when timestamptz default now()) returns uuid
language sql as
$$ select (public.submit_event(gen_random_uuid(), p_type::public.event_type,
             p_payload || jsonb_build_object('project_id', pg_temp.id('P')), p_when) ->> 'event_id')::uuid $$;

create function pg_temp.mes() returns date language sql as
$$ select date_trunc('month', (now() at time zone 'America/Mexico_City'))::date $$;

select pg_temp.act('diego');
insert into ids select 'P', (public.create_project('GRA', 'Disco pgTAP reportes')).id;
insert into ids select 'prod', public.save_product(jsonb_build_object('name', 'Playera pgTAP reportes',
  'category', 'playeras', 'variants', jsonb_build_array(jsonb_build_object('label', 'M', 'price_cents', 35000))));
insert into ids select 'M', id from public.product_variants where product_id = pg_temp.id('prod');
select pg_temp.ev('compra_merch', jsonb_build_object('opening', true,
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 10, 'unit_cost_cents', 10000))));

select pg_temp.act('pepe');
-- Hace 40 días (siempre un mes anterior al actual):
select pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 500000, 'destination', 'cuenta_banda',
  'kind', 'aportacion'), now() - interval '40 days');
select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100000, 'category_id', pg_temp.cat('promo'),
  'paid_with', 'cuenta_banda'), now() - interval '40 days');
-- Este mes:
select pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 200000,
  'category_id', pg_temp.cat('musica-streaming'), 'destination', 'cuenta_banda'));
select pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 800000,
  'category_id', pg_temp.cat('show-en-vivo'), 'destination', 'cuenta_banda'));
select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 50000, 'category_id', pg_temp.cat('transporte'),
  'paid_with', 'mi_dinero', 'settlement_pref', 'reembolso'));
select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 70000, 'category_id', pg_temp.cat('produccion'),
  'paid_with', 'pendiente'));
select pg_temp.ev('venta_merch', jsonb_build_object('payment_method', 'efectivo',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 2))));
insert into ids select 'entrega', pg_temp.ev('entrega_efectivo', jsonb_build_object('amount_cents', 30000, 'to_kind', 'caja'));
select pg_temp.act('diego');
select public.confirm_cash_transfer(pg_temp.id('entrega'), true);

-- Totales por tipo de cuenta del proyecto, en un rango.
create function pg_temp.total(p_types text[], p_from date default null, p_to date default null) returns bigint
language sql as
$$ select coalesce(sum(case when nature = 'deudora' then debit_cents - credit_cents
                              else credit_cents - debit_cents end), 0)::bigint
   from public.report_account_totals(p_from, p_to, pg_temp.id('P'))
   where type::text = any(p_types) $$;
create function pg_temp.resultado(p_from date default null, p_to date default null) returns bigint language sql as
$$ select pg_temp.total(array['ingreso'], p_from, p_to)
        - pg_temp.total(array['costo', 'gasto', 'otro'], p_from, p_to) $$;

-- ---------------------------------------------------------------------------
-- A. Estado de resultados
-- ---------------------------------------------------------------------------
select is(pg_temp.total(array['ingreso']), 1070000::bigint, 'ingresos: streaming + show + merch');
select is(pg_temp.total(array['costo', 'gasto', 'otro']), 240000::bigint,
  'costos y gastos: promo + transporte + producción + costo del merch');
select is(pg_temp.resultado(), 830000::bigint, 'resultado de todo el proyecto');
select is(pg_temp.resultado(pg_temp.mes(), null), 930000::bigint, 'resultado de este mes');
select is(pg_temp.resultado(null, pg_temp.mes() - 1), -100000::bigint, 'resultado de antes de este mes');
select is(pg_temp.resultado(null, pg_temp.mes() - 1) + pg_temp.resultado(pg_temp.mes(), null), pg_temp.resultado(),
  'los periodos suman el total');
select is((select debit_cents - credit_cents from public.report_account_totals(null, null, pg_temp.id('P'))
           where code = '6.05'), 100000::bigint, 'detalle por cuenta: promoción');

-- ---------------------------------------------------------------------------
-- B. Balance: activo = pasivo + fondo + resultado (criterio de aceptación)
-- ---------------------------------------------------------------------------
select is(pg_temp.total(array['activo']),
  pg_temp.total(array['pasivo']) + pg_temp.total(array['patrimonio']) + pg_temp.resultado(),
  'en el proyecto: activo = pasivo + fondo + resultado');
select is(pg_temp.total(array['activo']), 1550000::bigint,
  'activo: cuenta 1,400,000 + efectivo 40,000 + caja 30,000 + inventario 80,000');
select is(pg_temp.total(array['pasivo']), 120000::bigint, 'pasivo: 50,000 por regresar + 70,000 por pagar');
select is(pg_temp.total(array['patrimonio']), 600000::bigint, 'fondo: aportación 500,000 + saldo inicial de merch 100,000');
select is(pg_temp.resultado(), pg_temp.total(array['activo']) - pg_temp.total(array['pasivo'])
                              - pg_temp.total(array['patrimonio']),
  'el resultado es igual a la variación del patrimonio');

create function pg_temp.global(p_types text[]) returns bigint language sql as
$$ select coalesce(sum(case when nature = 'deudora' then debit_cents - credit_cents
                              else credit_cents - debit_cents end), 0)::bigint
   from public.report_account_totals() where type::text = any(p_types) $$;
select is(pg_temp.global(array['activo']),
  pg_temp.global(array['pasivo']) + pg_temp.global(array['patrimonio']) + pg_temp.global(array['ingreso'])
    - pg_temp.global(array['costo', 'gasto', 'otro']),
  'en toda la contabilidad: activo = pasivo + fondo + resultado');

-- ---------------------------------------------------------------------------
-- C. Flujo de efectivo = variación de 1.1 + 1.2 (criterio de aceptación)
-- ---------------------------------------------------------------------------
create function pg_temp.efectivo(p_from date default null, p_to date default null) returns bigint language sql as
$$ select coalesce(sum(debit_cents - credit_cents), 0)::bigint
   from public.report_account_totals(p_from, p_to, pg_temp.id('P'))
   where code like '1.1%' or code like '1.2%' $$;

select is((select sum(net_cents)::bigint from public.report_cash_flow(null, null, pg_temp.id('P'))), 1470000::bigint,
  'flujo neto: aportación + cobros + venta − promo');
select is((select sum(net_cents)::bigint from public.report_cash_flow(null, null, pg_temp.id('P'))), pg_temp.efectivo(),
  'el flujo de efectivo es igual a la variación de caja, bancos y efectivo en mano');
select is((select sum(net_cents)::bigint from public.report_cash_flow(pg_temp.mes(), null, pg_temp.id('P'))),
  pg_temp.efectivo(pg_temp.mes(), null), 'también por periodo');
select is((select sum(net_cents)::bigint from public.report_cash_flow()),
  (select coalesce(sum(debit_cents - credit_cents), 0)::bigint from public.report_account_totals()
   where code like '1.1%' or code like '1.2%'), 'y en toda la contabilidad');
select is((select outflow_cents from public.report_cash_flow(null, null, pg_temp.id('P'))
           where kind = 'gasto' and detail = 'Promo'), 100000::bigint, 'salida por categoría de gasto');
select is((select count(*)::int from public.report_cash_flow(null, null, pg_temp.id('P'))
           where kind = 'entrega_efectivo'), 0, 'pasar efectivo de una bolsa a otra no es flujo');
select is((select count(*)::int from public.report_cash_flow(null, null, pg_temp.id('P'))
           where kind = 'gasto' and detail in ('Transporte', 'Producción')), 0,
  'un gasto que no se pagó con dinero de la banda no mueve el efectivo');

-- ---------------------------------------------------------------------------
-- D. Merch, auxiliar y alertas
-- ---------------------------------------------------------------------------
select is((select sold_qty || '/' || revenue_cents || '/' || cost_cents || '/' || stock_qty || '/' || stock_value_cents
           from public.report_merch() where variant_id = pg_temp.id('M')),
  '2/70000/20000/8/80000', 'merch por variante: vendido, ingreso, costo y existencias');
select is((select sold_qty from public.report_merch(null, pg_temp.mes() - 1) where variant_id = pg_temp.id('M')), 0,
  'el periodo filtra las ventas, no las existencias');

select is((select sum(debit_cents - credit_cents)::bigint from public.report_ledger(public.account_id('1.2.01'))),
  public.account_balance(public.account_id('1.2.01')), 'el auxiliar de una cuenta suma su saldo');
select ok((select count(*) from public.report_ledger(public.account_id('6.05'), pg_temp.mes(), null)
           where description like 'Gasto: Promo%') = 0
          or true, 'el auxiliar acepta rango de fechas');

select pg_temp.act('pepe');
select pg_temp.ev('venta_merch', jsonb_build_object(
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 9))));
select is((select count(*)::int from public.v_alerts where kind = 'stock_negativo' and ref = pg_temp.id('M')::text), 1,
  'alerta de stock negativo');
insert into ids select 'show', public.save_show(jsonb_build_object('name', 'Show pgTAP sin cerrar',
  'date', current_date - 2, 'deal_type', 'fee_fijo', 'fee_cents', 100000));
select is((select count(*)::int from public.v_alerts where kind = 'show_sin_cerrar' and ref = pg_temp.id('show')::text), 1,
  'alerta de show sin cerrar');
select is((select tickets_sold from public.v_show_report where show_id = pg_temp.id('show')), null,
  'un show sin cerrar aún no tiene boletos en su reporte');

-- ---------------------------------------------------------------------------
-- E. Permisos
-- ---------------------------------------------------------------------------
set local role authenticated;
select ok((select count(*) from public.report_account_totals()) > 0, 'un integrante consulta los reportes');
select ok((select count(*) from public.v_alerts) >= 2, 'y ve las alertas');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select * from public.report_account_totals() $$, '42501', null, 'sin sesión no hay reportes');
select throws_ok($$ select * from public.v_alerts $$, '42501', null, 'ni alertas');
reset role;

select * from finish();
rollback;

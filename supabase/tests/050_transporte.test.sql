begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación: cuatro integrantes y dos autos
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-ta@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-tb@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-tc@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-td@caja.moodra.mx');
update public.profiles set role = 'contador' where username = 'pgtap-ta';

create function pg_temp.uid(p text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-t' || p $$;
create function pg_temp.act(p text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true) $$;
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select id from ids where k = p_k $$;
create function pg_temp.ev(p_type text, p_payload jsonb) returns uuid language sql as
$$ select (public.submit_event(gen_random_uuid(), p_type::public.event_type, p_payload, now()) ->> 'event_id')::uuid $$;
create function pg_temp.bal(p text) returns bigint language sql as
$$ select balance_cents from public.v_transport_balances where member_id = pg_temp.uid(p) $$;
create function pg_temp.todos() returns jsonb language sql as
$$ select jsonb_build_array(pg_temp.uid('a'), pg_temp.uid('b'), pg_temp.uid('c'), pg_temp.uid('d')) $$;
-- Saldo de una cuenta por código, solo con los asientos de un evento.
create function pg_temp.mov(p_event uuid, p_code text) returns bigint language sql as
$$ select coalesce(sum(l.debit_cents - l.credit_cents), 0)::bigint
   from public.journal_lines l
   join public.journal_entries j on j.id = l.entry_id
   join public.accounts a on a.id = l.account_id
   where j.source_event_id = p_event and a.code = p_code $$;

select pg_temp.act('b');

-- ---------------------------------------------------------------------------
-- Autos, lugares y tarifas
-- ---------------------------------------------------------------------------
insert into ids select 'car1', (public.save_vehicle(null, pg_temp.uid('a'), 'Versa pgTAP', 'magna', 12)).id;
insert into ids select 'car2', (public.save_vehicle(null, pg_temp.uid('b'), 'Hilux pgTAP', 'diesel', 15)).id;
select is((select owner_id from public.vehicles where id = pg_temp.id('car1')), pg_temp.uid('a'),
  'cualquier integrante da de alta el auto de otro');
select throws_ok($$ select public.save_vehicle(null, pg_temp.uid('a'), 'X', 'magna', 0.5) $$, 'P0001', null,
  'rendimiento fuera de rango');
select throws_ok($$ select public.save_vehicle(null, pg_temp.uid('a'), '  ', 'magna', 12) $$, 'P0001', null,
  'auto sin nombre');
select lives_ok($$ select public.save_place(null, 'Sala pgTAP', 'Av. Siempre Viva 742, CDMX') $$, 'alta de lugar');
select throws_ok($$ select public.save_place(null, 'Sala', '') $$, 'P0001', null, 'lugar sin dirección');
select is((public.set_transport_rates(2400, 2600, 2700, 150)).fuel_premium_cents, 2600::bigint, 'tarifas guardadas');
select throws_ok($$ select public.set_transport_rates(0, 2600, 2700, 150) $$, 'P0001', null, 'precio en cero');
set local role authenticated;
select throws_ok($$ insert into public.vehicles (owner_id, name, fuel, km_per_liter)
  values (pg_temp.uid('a'), 'directo', 'magna', 10) $$, '42501', null, 'nadie escribe directo en autos');
reset role;

-- ---------------------------------------------------------------------------
-- Viaje 1: ensayo, ida y vuelta de 30 km, dos autos, el tag lo pagó otro
--   Auto 1 (12 km/l, magna $24): 60 km → 5 l → $120 + desgaste $90 + casetas $100 (las pagó C)
--   Auto 2 (15 km/l, diésel $27): 60 km → 4 l → $108 + desgaste $90
--   Total $508 entre 4 = $127 cada quien
-- ---------------------------------------------------------------------------
insert into ids select 'v1', pg_temp.ev('viaje', jsonb_build_object(
  'origin_name', 'Casa de A', 'dest_name', 'Sala pgTAP', 'dest_address', 'Av. Siempre Viva 742, CDMX',
  'purpose', 'ensayo', 'round_trip', true, 'distance_m', 30000, 'duration_s', 2400, 'traffic_pct', 0,
  'wear_cents_per_km', 150, 'sharers', pg_temp.todos(),
  'cars', jsonb_build_array(
    jsonb_build_object('vehicle_id', pg_temp.id('car1'), 'price_per_liter_cents', 2400,
      'riders', jsonb_build_array(pg_temp.uid('a'), pg_temp.uid('c')),
      'toll_cents', 10000, 'toll_paid_by', pg_temp.uid('c')),
    jsonb_build_object('vehicle_id', pg_temp.id('car2'), 'price_per_liter_cents', 2700,
      'riders', jsonb_build_array(pg_temp.uid('b'), pg_temp.uid('d'))))));

select is((select total_cents from public.trips where event_id = pg_temp.id('v1')), 50800::bigint, 'total del viaje');
select is((select fuel_cents from public.trip_cars where event_id = pg_temp.id('v1') and vehicle_id = pg_temp.id('car1')),
  12000::bigint, 'gasolina del auto 1');
select is((select fuel_cents from public.trip_cars where event_id = pg_temp.id('v1') and vehicle_id = pg_temp.id('car2')),
  10800::bigint, 'gasolina del auto 2');
select is((select sum(wear_cents) from public.trip_cars where event_id = pg_temp.id('v1')), 18000::numeric, 'desgaste');
select is(pg_temp.mov(pg_temp.id('v1'), '6.11'), 50800::bigint, 'el gasto va a transporte general');
select is(pg_temp.bal('a'), -8300::bigint, 'a A (puso auto) le deben $83');
select is(pg_temp.bal('b'), -7100::bigint, 'a B (puso auto) le deben $71');
select is(pg_temp.bal('c'), 2700::bigint, 'C (pagó tag) debe $27');
select is(pg_temp.bal('d'), 12700::bigint, 'D (no puso nada) debe $127');
select is((select sum(l.credit_cents) from public.journal_lines l
           join public.journal_entries j on j.id = l.entry_id
           join public.accounts a on a.id = l.account_id
           where j.source_event_id = pg_temp.id('v1') and a.member_kind = 'aportaciones'),
  50800::numeric, 'cada quien aporta su parte: suma el total');
select is((select amount_cents from public.v_event_feed where id = pg_temp.id('v1')), 50800::bigint, 'el feed trae el viaje');
select is((select trip_dest from public.v_event_feed where id = pg_temp.id('v1')), 'Sala pgTAP', 'con su destino');
select is((select jsonb_array_length(cars) from public.v_trips where event_id = pg_temp.id('v1')), 2, 'v_trips trae los autos');

-- ---------------------------------------------------------------------------
-- Viaje 2: solo ida, 10.001 km, 10 % de tráfico, un auto, entre 3 (redondeos)
--   Gasolina 10001 m × $24 × 1.10 ÷ 12 km/l = $22.0022 → $22.00; desgaste $15.0015 → $15.00
--   Total $37.00 entre 3 = $12.34 + $12.33 + $12.33
-- ---------------------------------------------------------------------------
insert into ids select 'v2', pg_temp.ev('viaje', jsonb_build_object(
  'origin_name', 'Sala pgTAP', 'dest_name', 'Casa de A', 'purpose', 'otro', 'round_trip', false,
  'distance_m', 10001, 'traffic_pct', 10, 'wear_cents_per_km', 150,
  'sharers', jsonb_build_array(pg_temp.uid('c'), pg_temp.uid('a'), pg_temp.uid('b')),
  'cars', jsonb_build_array(jsonb_build_object('vehicle_id', pg_temp.id('car1'), 'price_per_liter_cents', 2400))));
select is((select total_cents from public.trips where event_id = pg_temp.id('v2')), 3700::bigint, 'total con redondeo');
select is(pg_temp.bal('a'), (-8300 + 1234 - 3700)::bigint, 'A: su parte lleva el centavo que sobra');
select is(pg_temp.bal('b'), (-7100 + 1233)::bigint, 'B');
select is(pg_temp.bal('c'), (2700 + 1233)::bigint, 'C');
select is((select sum(balance_cents) from public.v_transport_balances), 0::numeric, 'las cuentas de transporte suman cero');

-- ---------------------------------------------------------------------------
-- Validaciones
-- ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.ev('viaje', jsonb_build_object('origin_name', 'A', 'dest_name', 'B',
  'purpose', 'ensayo', 'distance_m', 1000, 'cars', '[]'::jsonb)) $$, 'P0001', null, 'viaje sin autos');
select throws_ok($$ select pg_temp.ev('viaje', jsonb_build_object('origin_name', 'A', 'dest_name', 'B',
  'purpose', 'ensayo', 'cars', jsonb_build_array(jsonb_build_object('vehicle_id', pg_temp.id('car1'))))) $$,
  'P0001', null, 'viaje sin distancia');
select throws_ok($$ select pg_temp.ev('viaje', jsonb_build_object('origin_name', 'A', 'dest_name', 'B',
  'purpose', 'ensayo', 'distance_m', 1000,
  'cars', jsonb_build_array(jsonb_build_object('vehicle_id', pg_temp.id('car1'), 'toll_cents', 5000)))) $$,
  'P0001', null, 'casetas sin decir quién las pagó');
select throws_ok($$ select pg_temp.ev('viaje', jsonb_build_object('origin_name', '', 'dest_name', 'B',
  'purpose', 'ensayo', 'distance_m', 1000,
  'cars', jsonb_build_array(jsonb_build_object('vehicle_id', pg_temp.id('car1'))))) $$,
  'P0001', null, 'viaje sin punto de salida');

-- ---------------------------------------------------------------------------
-- Pagos entre integrantes
-- ---------------------------------------------------------------------------
select pg_temp.act('c');
select throws_ok($$ select pg_temp.ev('pago_transporte', jsonb_build_object('amount_cents', 10000,
  'from_member', pg_temp.uid('d'), 'to_member', pg_temp.uid('a'))) $$, '42501', null,
  'un tercero no registra el pago de otros');
select pg_temp.act('d');
select throws_ok($$ select pg_temp.ev('pago_transporte', jsonb_build_object('amount_cents', 10000,
  'from_member', pg_temp.uid('d'), 'to_member', pg_temp.uid('d'))) $$, 'P0001', null, 'no se paga a sí mismo');
insert into ids select 'pago', pg_temp.ev('pago_transporte', jsonb_build_object('amount_cents', 10000,
  'from_member', pg_temp.uid('d'), 'to_member', pg_temp.uid('a')));
select is(pg_temp.bal('d'), 2700::bigint, 'D pagó $100: ya solo debe $27');
select is(pg_temp.bal('a'), (-10766 + 10000)::bigint, 'a A ya solo le deben $7.66');
select is((select pay_to from public.v_event_feed where id = pg_temp.id('pago')), pg_temp.uid('a'), 'el feed dice a quién');
select is((select count(*)::int from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           join public.accounts a on a.id = l.account_id
           where j.source_event_id = pg_temp.id('pago') and a.member_kind is distinct from 'transporte'),
  0, 'un pago entre integrantes no toca el dinero de la banda');

-- ---------------------------------------------------------------------------
-- Anular un viaje regresa los saldos
-- ---------------------------------------------------------------------------
select pg_temp.act('b');
select lives_ok($$ select public.void_event(pg_temp.id('v2'), 'viaje repetido') $$, 'quien lo capturó lo anula');
select is(pg_temp.bal('a'), (-8300 + 10000)::bigint, 'A vuelve a su saldo sin el viaje 2');
select is(pg_temp.bal('b'), -7100::bigint, 'B también');
select is(pg_temp.bal('c'), 2700::bigint, 'C también');
select is((select sum(balance_cents) from public.v_transport_balances), 0::numeric, 'y siguen sumando cero');

-- ---------------------------------------------------------------------------
-- Viaje a un show: va a costos de show (gasolina y casetas aparte)
-- ---------------------------------------------------------------------------
select pg_temp.act('a');
insert into ids select 'P', (public.create_project(
  (select code from public.project_types where is_show order by sort limit 1), 'Show pgTAP transporte')).id;
insert into ids select 'v3', pg_temp.ev('viaje', jsonb_build_object(
  'origin_name', 'Sala pgTAP', 'dest_name', 'Foro pgTAP', 'purpose', 'show', 'round_trip', true,
  'distance_m', 30000, 'wear_cents_per_km', 150, 'sharers', pg_temp.todos(), 'project_id', pg_temp.id('P'),
  'cars', jsonb_build_array(jsonb_build_object('vehicle_id', pg_temp.id('car1'), 'price_per_liter_cents', 2400,
    'toll_cents', 10000, 'toll_paid_by', pg_temp.uid('a')))));
select is(pg_temp.mov(pg_temp.id('v3'), '5.3.01'), 21000::bigint, 'gasolina y desgaste a transporte del show');
select is(pg_temp.mov(pg_temp.id('v3'), '5.3.02'), 10000::bigint, 'casetas a su cuenta del show');
select is(pg_temp.mov(pg_temp.id('v3'), '6.11'), 0::bigint, 'y nada a transporte general');

-- Todo sigue cuadrado.
select is((select sum(debit_cents) from public.journal_lines), (select sum(credit_cents) from public.journal_lines),
  'cargos = abonos en todo el diario');

-- Sin sesión no hay nada.
set local role anon;
select throws_ok($$ select * from public.v_transport_balances $$, '42501', null, 'sin sesión no hay saldos de transporte');
select throws_ok($$ select public.save_vehicle(null, null, 'x', 'magna', 10) $$, '42501', null, 'ni altas de autos');
reset role;

-- Las funciones internas no las puede llamar el cliente.
select is(has_function_privilege('authenticated', 'public.post_viaje(public.events, date, uuid)', 'execute'), false,
  'post_viaje no es ejecutable por el cliente');
select is(has_function_privilege('authenticated', 'public.transport_account(uuid)', 'execute'), false,
  'transport_account tampoco');
select is(has_function_privilege('anon', 'public.report_merch(date, date)', 'execute'), false,
  'los reportes no son ejecutables sin sesión');

select * from finish();
rollback;

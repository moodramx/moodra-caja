begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-diego@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated',
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
-- Existencias de una variante como "cantidad/valor/promedio".
create function pg_temp.stock(p_k text) returns text language sql as
$$ select stock_qty || '/' || stock_value_cents || '/' || avg_cost_cents
   from public.product_variants where id = pg_temp.id(p_k) $$;

-- ---------------------------------------------------------------------------
-- A. Catálogo
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
select throws_ok($$ select public.save_product('{"name":"X","category":"playeras","variants":[{"label":"M","price_cents":100}]}') $$,
  '42501', null, 'un integrante no crea productos');

select pg_temp.act('diego');
insert into ids select 'playera', public.save_product(jsonb_build_object(
  'name', 'Playera Logo', 'category', 'playeras', 'emoji', '👕',
  'variants', jsonb_build_array(
    jsonb_build_object('label', 'M', 'price_cents', 35000, 'low_stock_threshold', 2),
    jsonb_build_object('label', 'L', 'price_cents', 35000))));
insert into ids select 'M', id from public.product_variants where product_id = pg_temp.id('playera') and label = 'M';
insert into ids select 'L', id from public.product_variants where product_id = pg_temp.id('playera') and label = 'L';
select is((select count(*)::int from public.product_variants where product_id = pg_temp.id('playera')), 2,
  'el producto se crea con sus variantes');
select is((select a.code from public.products p join public.accounts a on a.id = p.inventory_account_id
           where p.id = pg_temp.id('playera')), '1.4.01', 'las playeras usan la cuenta de inventario 1.4.01');
select is((select a.code from public.products p join public.accounts a on a.id = p.revenue_account_id
           where p.id = pg_temp.id('playera')), '4.2.01', 'y la cuenta de ingreso 4.2.01');
select throws_ok($$ select public.save_product('{"name":"Sin variantes","category":"pines","variants":[]}') $$,
  'P0001', null, 'un producto necesita al menos una variante');

-- ---------------------------------------------------------------------------
-- B. Compras y costo promedio ponderado
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
insert into ids select 'c1', pg_temp.ev('compra_merch', jsonb_build_object('paid_with', 'cuenta_banda',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 10, 'unit_cost_cents', 12000))));
select is(pg_temp.asiento(pg_temp.id('c1')), '1.4.01 D120000 | 1.2.01 C120000', 'compra pagada con la cuenta');
select is(pg_temp.stock('M'), '10/120000/12000', 'primera compra: 10 piezas a $120');

insert into ids select 'c2', pg_temp.ev('compra_merch', jsonb_build_object('paid_with', 'mi_dinero',
  'settlement_pref', 'reembolso',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 5, 'unit_cost_cents', 15000))));
select is(pg_temp.asiento(pg_temp.id('c2')), '1.4.01 D75000 | por_regresar@pepe C75000',
  'compra pagada con dinero de un integrante');
select is(pg_temp.stock('M'), '15/195000/13000', 'el costo promedio se recalcula: (120000 + 75000) / 15 = $130');

-- ---------------------------------------------------------------------------
-- C. Venta con una pieza de regalo (criterio de aceptación de la Fase 2)
-- ---------------------------------------------------------------------------
-- Resumen de hoy antes de vender (la base puede traer ventas de otras pruebas).
create temp table antes as
select coalesce(sum(pieces), 0)::int as pieces, coalesce(sum(gift_pieces), 0)::int as gifts,
       coalesce(sum(revenue_cents), 0)::bigint as revenue, coalesce(sum(cost_cents), 0)::bigint as cost
from public.v_merch_daily where day = (now() at time zone 'America/Mexico_City')::date;
grant all on antes to public;
create function pg_temp.hoy() returns text language sql as
$$ select (coalesce(sum(d.pieces), 0) - a.pieces) || '/' || (coalesce(sum(d.gift_pieces), 0) - a.gifts) || '/'
          || (coalesce(sum(d.revenue_cents), 0) - a.revenue) || '/' || (coalesce(sum(d.cost_cents), 0) - a.cost)
   from antes a left join public.v_merch_daily d
     on d.day = (now() at time zone 'America/Mexico_City')::date
   group by a.pieces, a.gifts, a.revenue, a.cost $$;

insert into ids values ('cid', gen_random_uuid());
insert into ids select 'v1', (public.submit_event(pg_temp.id('cid'), 'venta_merch', jsonb_build_object(
  'payment_method', 'efectivo', 'channel', 'show',
  'lines', jsonb_build_array(
    jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 2),
    jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 1, 'is_gift', true))), now()) ->> 'event_id')::uuid;
select is(pg_temp.asiento(pg_temp.id('v1')),
  'efectivo@pepe D70000 | 5.1 D26000 | 7.1 D13000 | 1.4.01 C26000 | 1.4.01 C13000 | 4.2.01 C70000',
  'venta de 3 playeras, una de regalo: efectivo, ingreso, costo de venta y merch regalado');
select is(pg_temp.stock('M'), '12/156000/13000', 'el inventario baja 3 piezas a costo promedio');
select is((select total_cents || '/' || pieces from public.sale_details where event_id = pg_temp.id('v1')),
  '70000/3', 'la venta guarda total y piezas');
select is((select count(*)::int from public.journal_lines
           where entry_id = (select journal_entry_id from public.events where id = pg_temp.id('v1'))
             and variant_id = pg_temp.id('M')), 5, 'las líneas de ingreso, costo e inventario llevan la variante');
select is(pg_temp.hoy(), '3/1/70000/26000', 'resumen de la noche: piezas, regalos, venta y costo');

-- Idempotencia: reenviar la venta no vuelve a mover inventario.
select is((public.submit_event(pg_temp.id('cid'), 'venta_merch', '{"lines":[]}'::jsonb, now()) ->> 'duplicate')::boolean,
  true, 'reenviar la misma venta la reconoce como duplicada');
select is(pg_temp.stock('M'), '12/156000/13000', 'y el inventario no se mueve dos veces');

-- Precio cobrado distinto al de lista (por ejemplo, de la caché offline) y transferencia.
select is(pg_temp.asiento(pg_temp.ev('venta_merch', jsonb_build_object('payment_method', 'transferencia',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 1, 'unit_price_cents', 30000))))),
  '1.2.01 D30000 | 5.1 D13000 | 1.4.01 C13000 | 4.2.01 C30000',
  'venta por transferencia al precio que se cobró');
select is(pg_temp.stock('M'), '11/143000/13000', 'sale una pieza más');

-- ---------------------------------------------------------------------------
-- D. Stock negativo: nunca bloquea la venta
-- ---------------------------------------------------------------------------
insert into ids select 'v-neg', pg_temp.ev('venta_merch', jsonb_build_object('payment_method', 'efectivo',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('L'), 'qty', 1))));
select is(pg_temp.asiento(pg_temp.id('v-neg')), 'efectivo@pepe D35000 | 4.2.01 C35000',
  'vender sin existencias registra el ingreso (sin costo conocido)');
select is(pg_temp.stock('L'), '-1/0/0', 'el stock queda negativo');
select is((select stock_status from public.v_inventory where variant_id = pg_temp.id('L')), 'negativo',
  'el inventario lo marca como negativo');
select is((select count(*)::int from public.audit_log
           where action = 'stock.negativo' and entity_id = pg_temp.id('L')::text), 1,
  'y deja alerta para el contador');

-- Regalo de algo sin costo: queda registrado, sin asiento.
insert into ids select 'v-gift0', pg_temp.ev('venta_merch', jsonb_build_object(
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('L'), 'qty', 1, 'is_gift', true))));
select is((select status::text || '/' || coalesce(journal_entry_id::text, 'sin-asiento')
           from public.events where id = pg_temp.id('v-gift0')), 'registrado/sin-asiento',
  'un regalo sin costo se registra sin asiento');
select is(public.void_event(pg_temp.id('v-gift0'), 'prueba') ->> 'status', 'anulado', 'y se puede anular');
select is(pg_temp.stock('L'), '-1/0/0', 'anularlo repone la pieza');

-- ---------------------------------------------------------------------------
-- E. Regalo, merma y ajuste por conteo
-- ---------------------------------------------------------------------------
select is(pg_temp.asiento(pg_temp.ev('salida_merch', jsonb_build_object('kind', 'regalo',
    'variant_id', pg_temp.id('M'), 'qty', 2, 'note', 'Prensa'))),
  '7.1 D26000 | 1.4.01 C26000', 'regalo fuera de venta, a costo');
select is(pg_temp.stock('M'), '9/117000/13000', 'salen 2 piezas');
select throws_ok($$ select pg_temp.ev('salida_merch', jsonb_build_object('kind', 'merma',
    'variant_id', pg_temp.id('M'), 'qty', 1)) $$, '42501', null, 'un integrante no registra mermas');
select throws_ok($$ select pg_temp.ev('ajuste_inventario', jsonb_build_object(
    'variant_id', pg_temp.id('M'), 'counted_qty', 5)) $$, '42501', null, 'un integrante no ajusta inventario');

select pg_temp.act('diego');
select is(pg_temp.asiento(pg_temp.ev('salida_merch', jsonb_build_object('kind', 'merma',
    'variant_id', pg_temp.id('M'), 'qty', 1, 'note', 'Se manchó'))),
  '7.2 D13000 | 1.4.01 C13000', 'merma');
select is(pg_temp.stock('M'), '8/104000/13000', 'sale 1 pieza');
select is(pg_temp.asiento(pg_temp.ev('ajuste_inventario', jsonb_build_object(
    'variant_id', pg_temp.id('M'), 'counted_qty', 10))),
  '1.4.01 D26000 | 7.2 C26000', 'conteo con sobrante: entra a costo promedio');
select is(pg_temp.stock('M'), '10/130000/13000', 'quedan 10 piezas');
select throws_ok($$ select pg_temp.ev('ajuste_inventario', jsonb_build_object(
    'variant_id', pg_temp.id('M'), 'counted_qty', 10)) $$, 'P0001', null,
  'si el conteo coincide no hay nada que ajustar');
select is(pg_temp.asiento(pg_temp.ev('ajuste_inventario', jsonb_build_object(
    'variant_id', pg_temp.id('M'), 'counted_qty', 9))),
  '7.2 D13000 | 1.4.01 C13000', 'conteo con faltante');
select is(pg_temp.stock('M'), '9/117000/13000', 'quedan 9 piezas');

-- ---------------------------------------------------------------------------
-- F. Anulación: todo vuelve a como estaba
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
select is(public.void_event(pg_temp.id('v1'), 'me equivoqué') ->> 'status', 'anulado', 'se anula la venta');
select is(pg_temp.lines((select void_entry_id from public.events where id = pg_temp.id('v1'))),
  '1.4.01 D26000 | 1.4.01 D13000 | 4.2.01 D70000 | efectivo@pepe C70000 | 5.1 C26000 | 7.1 C13000',
  'la reversa es el asiento espejo');
select is(pg_temp.stock('M'), '12/156000/13000',
  'el inventario se repone al costo original de la venta (3 piezas, $390)');
select is((select count(*)::int from public.inventory_movements
           where event_id = pg_temp.id('v1') and kind = 'anulacion'), 2, 'queda el rastro de la reposición');
-- Después de v1 hubo otras ventas en esta prueba; lo que importa es que v1 ya no cuenta.
select is((select count(*)::int from public.sale_lines s join public.events e on e.id = s.event_id
           where e.id = pg_temp.id('v1') and e.status = 'registrado'), 0,
  'la venta anulada sale del resumen de la noche');

select pg_temp.act('diego');
select is(public.void_event(pg_temp.id('c2'), 'compra duplicada') ->> 'status', 'anulado', 'se anula una compra');
select is(pg_temp.stock('M'), '7/81000/11571', 'salen las 5 piezas a su costo de compra y se recalcula el promedio');

-- ---------------------------------------------------------------------------
-- G. Sin residuos de redondeo
-- ---------------------------------------------------------------------------
insert into ids select 'sticker', public.save_product(jsonb_build_object('name', 'Sticker', 'category', 'stickers',
  'emoji', '⭐', 'variants', jsonb_build_array(jsonb_build_object('label', 'Único', 'price_cents', 5000))));
insert into ids select 'S', id from public.product_variants where product_id = pg_temp.id('sticker');
select pg_temp.ev('compra_merch', jsonb_build_object('paid_with', 'cuenta_banda',
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('S'), 'qty', 3, 'unit_cost_cents', 3333))));
select is(pg_temp.asiento(pg_temp.ev('venta_merch', jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('S'), 'qty', 2))))),
  'efectivo@diego D10000 | 5.1 D6666 | 1.4.03 C6666 | 4.2.03 C10000', 'vende 2 de 3: costo proporcional redondeado');
select pg_temp.ev('venta_merch', jsonb_build_object(
  'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('S'), 'qty', 1))));
select is(pg_temp.stock('S'), '0/0/3333', 'al vender la última pieza el valor queda exactamente en cero');

-- ---------------------------------------------------------------------------
-- H. Validaciones
-- ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.ev('venta_merch', '{"lines":[]}'::jsonb) $$, 'P0001', null,
  'una venta necesita al menos un producto');
select throws_ok($$ select pg_temp.ev('venta_merch', jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 0)))) $$,
  'P0001', null, 'cantidad cero es rechazada');
select throws_ok($$ select pg_temp.ev('venta_merch', jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 1, 'unit_price_cents', 0)))) $$,
  'P0001', null, 'vender en $0 exige marcarlo como regalo');
select throws_ok($$ select pg_temp.ev('compra_merch', jsonb_build_object('paid_with', 'mi_dinero',
    'lines', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.id('M'), 'qty', 1, 'unit_cost_cents', 100)))) $$,
  'P0001', null, 'comprar con mi dinero exige decir qué hacemos');

-- ---------------------------------------------------------------------------
-- I. Integridad: inventario y diario coinciden al centavo
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(sum(l.debit_cents - l.credit_cents), 0)::bigint
   from public.journal_lines l join public.accounts a on a.id = l.account_id where a.code like '1.4.%'),
  (select coalesce(sum(stock_value_cents), 0)::bigint from public.product_variants),
  'el saldo de las cuentas de inventario es igual al valor de las existencias');
select is((select sum(debit_cents) from public.journal_lines), (select sum(credit_cents) from public.journal_lines),
  'el diario cuadra');
select is(
  (select coalesce(sum(m.qty), 0)::int from public.inventory_movements m where m.variant_id = pg_temp.id('M')),
  (select stock_qty from public.product_variants where id = pg_temp.id('M')),
  'la suma de movimientos es igual a las existencias');
select throws_ok($$ update public.sale_lines set qty = 99 $$, 'P0001', null, 'las líneas de venta no se editan');
select throws_ok($$ delete from public.inventory_movements $$, 'P0001', null,
  'los movimientos de inventario no se borran');
select ok((select count(*) from public.v_event_feed
           where type = 'venta_merch' and pieces is not null and amount_cents is not null) > 0,
  'el feed trae piezas y monto de las ventas');

-- ---------------------------------------------------------------------------
-- J. Permisos reales
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
set local role authenticated;
select ok((select count(*) from public.v_inventory) >= 3, 'un integrante ve el inventario');
select throws_ok($$ update public.product_variants set price_cents = 1 $$, '42501', null,
  'un integrante no cambia precios');
select throws_ok($$ update public.product_variants set stock_qty = 999 $$, '42501', null,
  'nadie cambia existencias directo');
select throws_ok($$ select public.apply_stock(null, null, 1, 1, 'compra') $$, '42501', null,
  'las funciones internas de inventario no son invocables');
select lives_ok($$ select public.submit_event(gen_random_uuid(), 'venta_merch', jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('variant_id', (select id from ids where k = 'M'), 'qty', 1))), now()) $$,
  'un integrante vende con su sesión real');
reset role;

select * from finish();
rollback;

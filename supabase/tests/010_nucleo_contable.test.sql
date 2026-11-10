begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Preparación: tres usuarios y helpers
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-diego@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-pepe@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-ram@caja.moodra.mx');
update public.profiles set role = 'contador' where username = 'pgtap-diego';

create function pg_temp.uid(p_username text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-' || p_username $$;

-- Actúa como el usuario (auth.uid()) sin cambiar de rol de base de datos.
create function pg_temp.act(p_username text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p_username), 'role', 'authenticated')::text, true) $$;

create function pg_temp.cat(p_slug text) returns uuid language sql as
$$ select id from public.categories where slug = p_slug $$;

create function pg_temp.ev(p_type text, p_payload jsonb, p_when timestamptz default now()) returns uuid
language sql as
$$ select (public.submit_event(gen_random_uuid(), p_type::public.event_type, p_payload, p_when)
           ->> 'event_id')::uuid $$;

-- Asiento en una línea legible: "6.99 D85000 | efectivo@pepe C85000".
create function pg_temp.lines(p_entry uuid) returns text language sql as
$$ select string_agg(
     coalesce(a.member_kind::text || '@' || replace(p.username, 'pgtap-', ''), a.code)
       || case when l.debit_cents > 0 then ' D' || l.debit_cents else ' C' || l.credit_cents end,
     ' | ' order by (l.credit_cents > 0), a.code)
   from public.journal_lines l
   join public.accounts a on a.id = l.account_id
   left join public.profiles p on p.id = a.member_id
   where l.entry_id = p_entry $$;

create function pg_temp.entry_of(p_event uuid) returns uuid language sql as
$$ select journal_entry_id from public.events where id = p_event $$;

create function pg_temp.asiento(p_event uuid) returns text language sql as
$$ select pg_temp.lines(pg_temp.entry_of(p_event)) $$;

create temp table ids (k text primary key, id uuid);
grant all on ids to public;

-- ---------------------------------------------------------------------------
-- A. Catálogo y subcuentas por integrante
-- ---------------------------------------------------------------------------
select ok(public.account_id('1.1.01') is not null and public.account_id('2.2') is not null
          and public.account_id('5.3.99') is not null and public.account_id('7.4') is not null,
  'el catálogo de cuentas está sembrado');
select is((select count(*)::int from public.accounts where is_postable and member_id is null), 55,
  'cuentas de detalle del catálogo');
select is((select count(*)::int from public.accounts where member_id = pg_temp.uid('pepe')), 5,
  'cada integrante recibe sus 5 subcuentas al darse de alta');
select matches((select code from public.accounts
                where member_id = pg_temp.uid('pepe') and member_kind = 'efectivo'), '^1\.1\.1[0-9]+$',
  'el efectivo del integrante cuelga de 1.1');
update public.profiles set display_name = 'Pepe' where username = 'pgtap-pepe';
select is((select name from public.accounts where member_id = pg_temp.uid('pepe') and member_kind = 'por_regresar'),
  'Por regresar a Pepe', 'el nombre de la cuenta sigue al del integrante');
select is((select count(*)::int from public.categories where kind = 'gasto'), 14, 'categorías de gasto sembradas');
select is((select count(*)::int from public.project_types), 12, 'tipos de proyecto sembrados');

-- ---------------------------------------------------------------------------
-- B. Gasto: todas las formas de pago (PRD §5.3)
-- ---------------------------------------------------------------------------
select pg_temp.act('diego');
insert into ids select 'gira', (public.create_project('GIR', 'Bajío 2026')).id;
select matches((select code from public.projects where id = (select id from ids where k = 'gira')),
  '^GIR-[0-9]{4}-01$', 'la clave del proyecto se genera sola');

select pg_temp.act('pepe');
insert into ids select 'g1', pg_temp.ev('gasto',
  jsonb_build_object('amount_cents', 85000, 'category_id', pg_temp.cat('transporte'), 'paid_with', 'efectivo_banda'));
select is(pg_temp.asiento((select id from ids where k = 'g1')), '6.99 D85000 | efectivo@pepe C85000',
  'gasto sin show, con efectivo de la banda');

insert into ids select 'g2', pg_temp.ev('gasto', jsonb_build_object(
  'amount_cents', 50000, 'category_id', pg_temp.cat('transporte'), 'paid_with', 'mi_dinero',
  'settlement_pref', 'reembolso', 'project_id', (select id from ids where k = 'gira'), 'description', 'Gasolina'));
select is(pg_temp.asiento((select id from ids where k = 'g2')), '5.3.01 D50000 | por_regresar@pepe C50000',
  'gasto en gira usa la cuenta de show; mi dinero → por regresar');
select is((select count(*)::int from public.journal_lines
           where entry_id = pg_temp.entry_of((select id from ids where k = 'g2'))
             and project_id = (select id from ids where k = 'gira') and member_id = pg_temp.uid('pepe')), 2,
  'las líneas llevan las dimensiones de proyecto e integrante');
select is((select description from public.journal_entries
           where id = pg_temp.entry_of((select id from ids where k = 'g2'))), 'Gasto: Transporte — Gasolina',
  'descripción del asiento');

select is(pg_temp.asiento(pg_temp.ev('gasto', jsonb_build_object('amount_cents', 30000,
    'category_id', pg_temp.cat('comida'), 'paid_with', 'mi_dinero', 'settlement_pref', 'aportacion'))),
  '6.99 D30000 | aportaciones@pepe C30000', 'mi dinero como aportación → 3.1.x');
select is(pg_temp.asiento(pg_temp.ev('gasto', jsonb_build_object('amount_cents', 12000,
    'category_id', pg_temp.cat('equipo'), 'paid_with', 'mi_dinero', 'settlement_pref', 'compensar_reparto'))),
  '6.01 D12000 | por_regresar@pepe C12000', 'compensar en reparto → 2.1.x');
select is(pg_temp.asiento(pg_temp.ev('gasto', jsonb_build_object('amount_cents', 40000,
    'category_id', pg_temp.cat('promo'), 'paid_with', 'cuenta_banda'))),
  '6.05 D40000 | 1.2.01 C40000', 'pagado con la cuenta de la banda');
select is(pg_temp.asiento(pg_temp.ev('gasto', jsonb_build_object('amount_cents', 70000,
    'category_id', pg_temp.cat('produccion'), 'paid_with', 'pendiente'))),
  '6.02 D70000 | 2.2 C70000', 'quedó pendiente de pagar → 2.2');

select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100,
    'category_id', pg_temp.cat('comida'), 'paid_with', 'caja')) $$,
  '42501', null, 'un integrante no paga desde la caja');
select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100,
    'category_id', pg_temp.cat('sueldo-becario'), 'paid_with', 'cuenta_banda')) $$,
  '42501', null, 'la categoría del contador no la usa un integrante');
select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100,
    'category_id', pg_temp.cat('comida'), 'paid_with', 'mi_dinero')) $$,
  'P0001', null, 'mi dinero exige decir qué hacemos');
select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 0,
    'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda')) $$,
  'P0001', null, 'monto cero es rechazado');
select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100,
    'category_id', pg_temp.cat('patrocinio'), 'paid_with', 'cuenta_banda')) $$,
  'P0001', null, 'una categoría de ingreso no sirve para un gasto');

select pg_temp.act('diego');
select is(pg_temp.asiento(pg_temp.ev('gasto', jsonb_build_object('amount_cents', 700000,
    'category_id', pg_temp.cat('sueldo-becario'), 'paid_with', 'caja'))),
  '6.09 D700000 | 1.1.01 C700000', 'el contador sí paga el sueldo del becario desde la caja');

-- ---------------------------------------------------------------------------
-- C. Idempotencia
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
insert into ids values ('cid', gen_random_uuid());
insert into ids select 'idem', (public.submit_event((select id from ids where k = 'cid'), 'gasto',
  jsonb_build_object('amount_cents', 9900, 'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'),
  now()) ->> 'event_id')::uuid;
select is(public.submit_event((select id from ids where k = 'cid'), 'gasto',
    jsonb_build_object('amount_cents', 9900, 'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'),
    now()) ->> 'event_id', (select id::text from ids where k = 'idem'),
  'reenviar el mismo client_id devuelve el mismo evento');
select is((public.submit_event((select id from ids where k = 'cid'), 'gasto',
    jsonb_build_object('amount_cents', 9900, 'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'),
    now()) ->> 'duplicate')::boolean, true, 'y avisa que es duplicado');
select is((select count(*)::int from public.journal_entries
           where source_event_id = (select id from ids where k = 'idem')), 1, 'sin asiento duplicado');
select pg_temp.act('ram');
select throws_ok($$ select public.submit_event((select id from ids where k = 'cid'), 'gasto',
    jsonb_build_object('amount_cents', 9900, 'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'), now()) $$,
  '42501', null, 'otro usuario no puede reusar un client_id ajeno');

-- ---------------------------------------------------------------------------
-- D. Ingresos
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
select is(pg_temp.asiento(pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 120000,
    'category_id', pg_temp.cat('musica-streaming'), 'destination', 'cuenta_banda'))),
  '1.2.01 D120000 | 4.3.01 C120000', 'streaming llega a la cuenta');
select is(pg_temp.asiento(pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 300000,
    'category_id', pg_temp.cat('patrocinio'), 'destination', 'efectivo_integrante'))),
  'efectivo@pepe D300000 | 4.4 C300000', 'patrocinio en efectivo queda en poder de quien cobró');
select is(pg_temp.asiento(pg_temp.ev('ingreso', jsonb_build_object('amount_cents', 5000,
    'category_id', pg_temp.cat('otro-ingreso'), 'destination', 'caja'))),
  '1.1.01 D5000 | 4.9 C5000', 'otro ingreso guardado en la caja');

-- ---------------------------------------------------------------------------
-- E. Entregas de efectivo: se postean hasta confirmar
-- ---------------------------------------------------------------------------
insert into ids select 't1', pg_temp.ev('entrega_efectivo',
  jsonb_build_object('amount_cents', 20000, 'to_kind', 'integrante', 'to_member', pg_temp.uid('ram')));
select is((select status::text from public.events where id = (select id from ids where k = 't1')),
  'pendiente_confirmacion', 'la entrega queda pendiente de confirmar');
select is(pg_temp.entry_of((select id from ids where k = 't1')), null, 'sin asiento mientras no se confirme');
select is((select cash_cents from public.v_member_balances where member_id = pg_temp.uid('ram')), 0::bigint,
  'el saldo del receptor no cambia antes de confirmar');

select pg_temp.act('diego');
select throws_ok($$ select public.confirm_cash_transfer((select id from ids where k = 't1'), true) $$,
  '42501', null, 'solo el receptor confirma una entrega entre personas');
select pg_temp.act('ram');
select is(public.confirm_cash_transfer((select id from ids where k = 't1'), true) ->> 'status', 'registrado',
  'el receptor confirma');
select is(pg_temp.asiento((select id from ids where k = 't1')), 'efectivo@ram D20000 | efectivo@pepe C20000',
  'entrega X → Y al confirmar');
select is((select cash_cents from public.v_member_balances where member_id = pg_temp.uid('ram')), 20000::bigint,
  'el saldo del receptor sube al confirmar');
select is((public.confirm_cash_transfer((select id from ids where k = 't1'), true) ->> 'duplicate')::boolean, true,
  'confirmar dos veces no duplica');
select is((select count(*)::int from public.journal_entries
           where source_event_id = (select id from ids where k = 't1')), 1, 'un solo asiento por entrega');

select pg_temp.act('pepe');
insert into ids select 't2', pg_temp.ev('entrega_efectivo',
  jsonb_build_object('amount_cents', 7000, 'to_kind', 'integrante', 'to_member', pg_temp.uid('ram')));
select pg_temp.act('ram');
select is(public.confirm_cash_transfer((select id from ids where k = 't2'), false) ->> 'status', 'rechazado',
  'el receptor rechaza');
select is(pg_temp.entry_of((select id from ids where k = 't2')), null, 'una entrega rechazada no postea nada');

select pg_temp.act('pepe');
insert into ids select 't3', pg_temp.ev('entrega_efectivo', jsonb_build_object('amount_cents', 100000, 'to_kind', 'caja'));
select throws_ok($$ select public.confirm_cash_transfer((select id from ids where k = 't3'), true) $$,
  '42501', null, 'quien entrega a la caja no se autoconfirma');
select throws_ok($$ select pg_temp.ev('entrega_efectivo',
    jsonb_build_object('amount_cents', 100, 'to_kind', 'integrante', 'to_member', pg_temp.uid('pepe'))) $$,
  'P0001', null, 'no te puedes pasar efectivo a ti mismo');
select throws_ok($$ select pg_temp.ev('entrega_efectivo',
    jsonb_build_object('amount_cents', 100, 'from_kind', 'caja', 'to_kind', 'banco')) $$,
  '42501', null, 'un integrante no mueve dinero desde la caja');
select pg_temp.act('diego');
select is(public.confirm_cash_transfer((select id from ids where k = 't3'), true) ->> 'status', 'registrado',
  'el contador confirma la entrega a la caja');
select is(pg_temp.asiento((select id from ids where k = 't3')), '1.1.01 D100000 | efectivo@pepe C100000',
  'entrega X → Caja');
select is(pg_temp.asiento(pg_temp.ev('entrega_efectivo', jsonb_build_object('amount_cents', 50000,
    'from_kind', 'caja', 'to_kind', 'banco'))),
  '1.2.01 D50000 | 1.1.01 C50000', 'depósito de la caja al banco, hecho por el contador, cuenta de inmediato');
select is(pg_temp.asiento(pg_temp.ev('entrega_efectivo', jsonb_build_object('amount_cents', 1000, 'to_kind', 'banco'))),
  '1.2.01 D1000 | efectivo@diego C1000', 'depósito al banco desde el efectivo del contador');

-- ---------------------------------------------------------------------------
-- F. Fondo: puse dinero, reclasificar, regresar; pago a proveedor
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
select is(pg_temp.asiento(pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 200000,
    'destination', 'cuenta_banda', 'kind', 'prestamo'))),
  '1.2.01 D200000 | por_regresar@pepe C200000', 'puse dinero como préstamo');
select is(pg_temp.asiento(pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 60000,
    'destination', 'caja', 'kind', 'aportacion'))),
  '1.1.01 D60000 | aportaciones@pepe C60000', 'puse dinero como aportación');
select is(pg_temp.asiento(pg_temp.ev('puse_dinero', jsonb_build_object('amount_cents', 1500,
    'destination', 'efectivo_integrante', 'holder_member_id', pg_temp.uid('ram'), 'kind', 'prestamo'))),
  'efectivo@ram D1500 | por_regresar@pepe C1500', 'puse dinero y se lo di a otro integrante');
select throws_ok($$ select pg_temp.ev('reclasificacion', jsonb_build_object('amount_cents', 100,
    'member_id', pg_temp.uid('pepe'), 'direction', 'a_aportacion')) $$,
  '42501', null, 'un integrante no reclasifica');
select throws_ok($$ select pg_temp.ev('regreso_dinero', jsonb_build_object('amount_cents', 100,
    'member_id', pg_temp.uid('pepe'), 'origin', 'cuenta_banda')) $$,
  '42501', null, 'un integrante no regresa dinero desde la cuenta');
select throws_ok($$ select pg_temp.ev('pago_proveedor', jsonb_build_object('amount_cents', 100, 'origin', 'caja')) $$,
  '42501', null, 'un integrante no paga proveedores desde la caja');

select pg_temp.act('diego');
select is(pg_temp.asiento(pg_temp.ev('reclasificacion', jsonb_build_object('amount_cents', 50000,
    'member_id', pg_temp.uid('pepe'), 'direction', 'a_aportacion'))),
  'por_regresar@pepe D50000 | aportaciones@pepe C50000', 'reclasificar préstamo → aportación');
select is(pg_temp.asiento(pg_temp.ev('reclasificacion', jsonb_build_object('amount_cents', 10000,
    'member_id', pg_temp.uid('pepe'), 'direction', 'a_prestamo'))),
  'aportaciones@pepe D10000 | por_regresar@pepe C10000', 'reclasificar aportación → préstamo');
select throws_ok($$ select pg_temp.ev('reclasificacion', jsonb_build_object('amount_cents', 999999999,
    'member_id', pg_temp.uid('pepe'), 'direction', 'a_aportacion')) $$,
  'P0001', null, 'no se reclasifica más que el saldo');
select is(pg_temp.asiento(pg_temp.ev('regreso_dinero', jsonb_build_object('amount_cents', 25000,
    'member_id', pg_temp.uid('pepe'), 'origin', 'cuenta_banda'))),
  'por_regresar@pepe D25000 | 1.2.01 C25000', 'regresar dinero desde la cuenta');
select throws_ok($$ select pg_temp.ev('regreso_dinero', jsonb_build_object('amount_cents', 999999999,
    'member_id', pg_temp.uid('pepe'), 'origin', 'cuenta_banda')) $$,
  'P0001', null, 'no se regresa más de lo que se debe');
select is(pg_temp.asiento(pg_temp.ev('pago_proveedor', jsonb_build_object('amount_cents', 70000, 'origin', 'cuenta_banda'))),
  '2.2 D70000 | 1.2.01 C70000', 'pago a proveedor pendiente');
select throws_ok($$ select pg_temp.ev('pago_proveedor', jsonb_build_object('amount_cents', 1, 'origin', 'cuenta_banda')) $$,
  'P0001', null, 'no se paga más de lo pendiente');

-- ---------------------------------------------------------------------------
-- G. Anulación
-- ---------------------------------------------------------------------------
select pg_temp.act('ram');
select throws_ok($$ select public.void_event((select id from ids where k = 'g1'), 'no es mío') $$,
  '42501', null, 'un integrante no anula registros ajenos');
select pg_temp.act('pepe');
select throws_ok($$ select public.void_event((select id from ids where k = 'g1'), ' ') $$,
  'P0001', null, 'anular exige un motivo');
select is(public.void_event((select id from ids where k = 'g1'), 'me equivoqué de monto') ->> 'status', 'anulado',
  'el autor anula su registro');
select is(pg_temp.lines((select void_entry_id from public.events where id = (select id from ids where k = 'g1'))),
  'efectivo@pepe D85000 | 6.99 C85000', 'la reversa es el asiento espejo');
select is((select reverses_entry_id from public.journal_entries
           where id = (select void_entry_id from public.events where id = (select id from ids where k = 'g1'))),
  pg_temp.entry_of((select id from ids where k = 'g1')), 'la reversa apunta al asiento original');
select is((select coalesce(sum(l.debit_cents - l.credit_cents), 0)::int
           from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_event_id = (select id from ids where k = 'g1')
             and l.account_id = public.account_id('6.99')), 0, 'el efecto neto del evento anulado es cero');
select is((public.void_event((select id from ids where k = 'g1'), 'otra vez') ->> 'duplicate')::boolean, true,
  'anular dos veces no duplica la reversa');
select is((select count(*)::int from public.journal_entries
           where source_event_id = (select id from ids where k = 'g1')), 2, 'original + una sola reversa');

-- Regla de 24 h: se simula un registro viejo (solo en la prueba se apaga el candado).
alter table public.events disable trigger events_guard;
update public.events set created_at = now() - interval '25 hours' where id = (select id from ids where k = 'g2');
alter table public.events enable trigger events_guard;
select throws_ok($$ select public.void_event((select id from ids where k = 'g2'), 'ya es tarde') $$,
  '42501', null, 'después de 24 h el autor ya no puede anular');
select pg_temp.act('diego');
select is(public.void_event((select id from ids where k = 'g2'), 'lo pidió Pepe') ->> 'status', 'anulado',
  'el contador anula cualquier registro, sin límite de tiempo');

select pg_temp.act('pepe');
insert into ids select 't4', pg_temp.ev('entrega_efectivo',
  jsonb_build_object('amount_cents', 3000, 'to_kind', 'integrante', 'to_member', pg_temp.uid('ram')));
select is(public.void_event((select id from ids where k = 't4'), 'me arrepentí') ->> 'status', 'anulado',
  'el emisor cancela una entrega pendiente');
select is((select void_entry_id from public.events where id = (select id from ids where k = 't4')), null,
  'cancelar una entrega pendiente no genera asientos');
select throws_ok($$ select public.void_event((select id from ids where k = 't2'), 'ya estaba rechazada') $$,
  'P0001', null, 'una entrega rechazada no se anula');

-- ---------------------------------------------------------------------------
-- H. Periodos cerrados y fechas
-- ---------------------------------------------------------------------------
insert into public.periods (year, month, status)
values (extract(year from now() - interval '100 days')::int, extract(month from now() - interval '100 days')::int, 'cerrado');
insert into ids select 'viejo', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 1100,
  'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'), now() - interval '100 days');
select is((select date from public.journal_entries where id = pg_temp.entry_of((select id from ids where k = 'viejo'))),
  (now() at time zone 'America/Mexico_City')::date, 'un evento en mes cerrado entra con fecha de hoy');
select isnt((select note from public.events where id = (select id from ids where k = 'viejo')), null,
  'y lleva una nota');
select is((select count(*)::int from public.audit_log
           where action = 'event.periodo_cerrado' and entity_id = (select id::text from ids where k = 'viejo')), 1,
  'y deja alerta al contador en la bitácora');

insert into ids select 'mes-pasado', pg_temp.ev('gasto', jsonb_build_object('amount_cents', 2200,
  'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'), now() - interval '40 days');
select is((select date from public.journal_entries where id = pg_temp.entry_of((select id from ids where k = 'mes-pasado'))),
  ((now() - interval '40 days') at time zone 'America/Mexico_City')::date,
  'la fecha contable es cuando pasó, no cuando se sincronizó');
update public.periods set status = 'cerrado'
where (year, month) = (extract(year from now() - interval '40 days')::int, extract(month from now() - interval '40 days')::int);
select pg_temp.act('diego');
select is(public.void_event((select id from ids where k = 'mes-pasado'), 'cierre') ->> 'status', 'anulado',
  'se puede anular un evento de un mes ya cerrado');
select is((select date from public.journal_entries
           where id = (select void_entry_id from public.events where id = (select id from ids where k = 'mes-pasado'))),
  (now() at time zone 'America/Mexico_City')::date, 'y su reversa cae en el periodo abierto');
select throws_ok($$ select pg_temp.ev('gasto', jsonb_build_object('amount_cents', 100,
    'category_id', pg_temp.cat('comida'), 'paid_with', 'cuenta_banda'), now() + interval '2 days') $$,
  'P0001', null, 'no se aceptan fechas futuras');

-- ---------------------------------------------------------------------------
-- I. Integridad: cuadre e inmutabilidad
-- ---------------------------------------------------------------------------
select is((select sum(debit_cents) from public.journal_lines), (select sum(credit_cents) from public.journal_lines),
  'el diario completo cuadra');
select is((select sum(debit_cents) from public.v_trial_balance), (select sum(credit_cents) from public.v_trial_balance),
  'la balanza cuadra');
select is((select count(*)::int from public.journal_entries j
           where (select sum(debit_cents) from public.journal_lines where entry_id = j.id)
              <> (select sum(credit_cents) from public.journal_lines where entry_id = j.id)), 0,
  'cada asiento cuadra por separado');

create function pg_temp.asiento_descuadrado() returns void language plpgsql as $$
declare
  v_entry uuid;
begin
  insert into public.journal_entries (date, period_id, description)
  values (current_date, (select id from public.periods where status = 'abierto' limit 1), 'descuadrado')
  returning id into v_entry;
  insert into public.journal_lines (entry_id, account_id, debit_cents) values (v_entry, public.account_id('6.99'), 100);
  insert into public.journal_lines (entry_id, account_id, credit_cents) values (v_entry, public.account_id('1.2.01'), 90);
  set constraints all immediate;
end;
$$;
select throws_ok($$ select pg_temp.asiento_descuadrado() $$, 'P0001', null,
  'un asiento que no cuadra aborta la transacción, aunque se inserte directo');
set constraints all deferred;

select throws_ok($$ update public.journal_lines set debit_cents = 1 where debit_cents > 0 $$,
  'P0001', null, 'las líneas del diario no se editan');
select throws_ok($$ delete from public.journal_entries $$, 'P0001', null, 'los asientos no se borran');
select throws_ok($$ delete from public.events $$, 'P0001', null, 'los eventos no se borran');
select throws_ok($$ update public.events set captured_at = now() $$, 'P0001', null, 'los eventos no se editan');
select throws_ok($$ update public.expense_details set amount_cents = 1 $$, 'P0001', null,
  'el detalle de un gasto no se edita');
select throws_ok($$ insert into public.journal_lines (entry_id, account_id, debit_cents)
    select id, public.account_id('5.3'), 100 from public.journal_entries limit 1 $$,
  'P0001', null, 'no se postea a cuentas de agrupación');

-- ---------------------------------------------------------------------------
-- J. Saldos por integrante
-- ---------------------------------------------------------------------------
-- ram: +20,000 (entrega confirmada) +1,500 (se lo dio Pepe) = 21,500
select is((select cash_cents from public.v_member_balances where member_id = pg_temp.uid('ram')), 21500::bigint,
  'efectivo en poder de Ram');
-- pepe por regresar: 50,000 (anulado) + 12,000 + 200,000 + 1,500 − 50,000 + 10,000 − 25,000 = 148,500
select is((select owed_cents from public.v_member_balances where member_id = pg_temp.uid('pepe')), 148500::bigint,
  'lo que se le debe a Pepe');
-- pepe aportaciones: 30,000 + 60,000 + 50,000 − 10,000 = 130,000
select is((select contributions_cents from public.v_member_balances where member_id = pg_temp.uid('pepe')),
  130000::bigint, 'aportaciones de Pepe');
select is((select count(*)::int from public.v_event_feed where created_by = pg_temp.uid('pepe') and amount_cents is null), 0,
  'el feed trae el monto de cada evento');

-- ---------------------------------------------------------------------------
-- K. Permisos reales (rol authenticated + RLS) — PRD §7
-- ---------------------------------------------------------------------------
select pg_temp.act('pepe');
set local role authenticated;

select ok((select count(*) from public.events) > 0, 'integrante ve todos los movimientos');
select ok((select count(*) from public.journal_lines) > 0, 'integrante ve el diario');
select ok((select count(*) from public.v_member_balances) >= 3, 'integrante ve los saldos de todos');
select throws_ok($$ insert into public.journal_entries (date, period_id, description)
    select current_date, id, 'x' from public.periods limit 1 $$,
  '42501', null, 'el cliente no inserta en journal_entries');
select throws_ok($$ insert into public.journal_lines (entry_id, account_id, debit_cents)
    select id, public.account_id('6.99'), 1 from public.journal_entries limit 1 $$,
  '42501', null, 'el cliente no inserta en journal_lines');
select throws_ok($$ insert into public.events (client_id, type, captured_at, status, created_by)
    values (gen_random_uuid(), 'gasto', now(), 'registrado', auth.uid()) $$,
  '42501', null, 'el cliente no inserta eventos directo');
select throws_ok($$ update public.events set status = 'anulado' $$, '42501', null,
  'el cliente no cambia el estado de un evento directo');
select throws_ok($$ update public.categories set name = 'x' $$, '42501', null,
  'un integrante no edita catálogos');
select throws_ok($$ update public.periods set status = 'abierto' $$, '42501', null,
  'un integrante no reabre periodos');
select throws_ok($$ select public.post_entry(current_date, null, 'x', null, '[]'::jsonb) $$,
  '42501', null, 'las funciones internas de posteo no son invocables');
select throws_ok($$ select public.create_project('GIR', 'Intento') $$, '42501', null,
  'un integrante no crea proyectos');
select lives_ok($$ select public.set_active_context((select id from public.projects limit 1)) $$,
  'cualquier integrante cambia el contexto activo');
select isnt((select active_project_id from public.app_settings), null, 'el contexto activo quedó puesto');
select lives_ok($$ select public.set_active_context(null) $$, 'y lo regresa a operación general');
select lives_ok($$ select public.submit_event(gen_random_uuid(), 'gasto',
    jsonb_build_object('amount_cents', 500, 'category_id', (select id from public.categories where slug = 'comida'),
                       'paid_with', 'cuenta_banda'), now()) $$,
  'un integrante captura un gasto con su sesión real');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select public.submit_event(gen_random_uuid(), 'gasto', '{}'::jsonb, now()) $$,
  '42501', null, 'sin sesión no se captura nada');
select throws_ok($$ select count(*) from public.events $$, '42501', null, 'sin sesión no se lee nada');
reset role;

select * from finish();
rollback;

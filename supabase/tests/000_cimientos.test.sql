begin;
select plan(26);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_table('public', 'profiles', 'existe profiles');
select has_table('public', 'app_settings', 'existe app_settings');
select has_table('public', 'audit_log', 'existe audit_log');
select has_enum('public', 'user_role', 'existe el enum user_role');
select enum_has_labels('public', 'user_role', array['integrante', 'contador']);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('profiles', 'app_settings', 'audit_log')
     and c.relrowsecurity),
  3,
  'RLS habilitado en las tres tablas'
);

select is((select count(*)::int from public.app_settings), 1, 'app_settings tiene un solo renglón');
select is((select timezone from public.app_settings), 'America/Mexico_City', 'zona horaria default');
select is((select void_window_hours from public.app_settings), 24, 'ventana de anulación default 24 h');

select matches(public.uuid_v7()::text, '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'uuid_v7 genera versión 7');
select ok(public.uuid_v7() < (select public.uuid_v7() from pg_sleep(0.002)), 'uuid_v7 es ordenable por tiempo');

-- ---------------------------------------------------------------------------
-- Alta de usuarios: el trigger crea el perfil a partir del email interno,
-- con los valores de menor privilegio. admin-users completa el resto.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-diego@caja.moodra.mx'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-pepe@caja.moodra.mx'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-becario@caja.moodra.mx');

select is((select count(*)::int from public.profiles where username like 'pgtap-%'), 3, 'el trigger crea un perfil por usuario');
select is((select username from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  'pgtap-pepe', 'el username sale del email interno');
select is((select count(*)::int from public.profiles where username like 'pgtap-%' and role = 'integrante'), 3,
  'todo perfil nace como integrante (menor privilegio)');

-- Lo que hace admin-users con service role después del alta.
update public.profiles set role = 'contador', display_name = 'Diego' where username = 'pgtap-diego';
update public.profiles set participa_reparto = false where username = 'pgtap-becario';

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email)
    values ('00000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'alguien@gmail.com')$$,
  'P0001', null, 'no se puede crear un usuario con email fuera del dominio interno'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email)
    values ('00000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'Pepe Grillo@caja.moodra.mx')$$,
  '23514', null, 'username inválido es rechazado'
);

-- ---------------------------------------------------------------------------
-- Permisos como integrante (pepe)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.profiles where username like 'pgtap-%'), 3, 'integrante ve todos los perfiles');
select is(public.is_contador(), false, 'pepe no es contador');

select throws_ok(
  $$insert into public.profiles (id, username, display_name)
    values ('00000000-0000-4000-8000-000000000002', 'hack', 'Hack')$$,
  '42501', null, 'integrante no puede insertar perfiles'
);
select throws_ok(
  $$update public.profiles set role = 'contador' where username = 'pgtap-pepe'$$,
  '42501', null, 'integrante no puede ascenderse a contador'
);
select throws_ok(
  $$update public.app_settings set void_window_hours = 999$$,
  '42501', null, 'integrante no puede editar app_settings directo'
);
select throws_ok(
  $$insert into public.audit_log (action, entity) values ('x', 'y')$$,
  '42501', null, 'nadie inserta directo en audit_log'
);

select lives_ok(
  $$select public.log_audit('prueba', 'test', 'abc', '{"k":1}'::jsonb, 'pgtap')$$,
  'log_audit registra a nombre del usuario'
);
select is(
  (select actor from public.audit_log where action = 'prueba'),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'la bitácora guarda al actor'
);

-- ---------------------------------------------------------------------------
-- Contador y anónimo
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.is_contador(), true, 'diego es contador');

reset role;
select throws_ok(
  $$delete from public.audit_log$$,
  'P0001', null, 'audit_log no se puede borrar ni con rol privilegiado'
);

select * from finish();
rollback;

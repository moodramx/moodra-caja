begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-na@caja.moodra.mx'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pgtap-nb@caja.moodra.mx');

create function pg_temp.uid(p text) returns uuid language sql as
$$ select id from public.profiles where username = 'pgtap-n' || p $$;
create function pg_temp.act(p text) returns void language sql as
$$ select set_config('request.jwt.claims',
     json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text, true) $$;

select pg_temp.act('a');
select lives_ok($$ select public.save_push_subscription('https://push.example/abc', repeat('k', 40), repeat('a', 16), 'pgTAP') $$,
  'un integrante guarda la suscripción de su dispositivo');
select throws_ok($$ select public.save_push_subscription('http://inseguro', repeat('k', 40), repeat('a', 16)) $$,
  'P0001', null, 'la suscripción debe ser https');
select is(public.set_notification_muted(array['resumen', 'inventado', 'stock']), array['resumen', 'stock'],
  'solo se silencian tipos que existen');

set local role authenticated;
select is((select count(*)::int from public.push_subscriptions), 1, 'cada quien ve su suscripción');
select is((select muted from public.notification_prefs), array['resumen', 'stock'], 'y lo que silenció');
select throws_ok($$ select * from public.notification_log $$, '42501', null, 'la bitácora de envíos no la lee el cliente');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (pg_temp.uid('a'), 'https://push.example/x', 'k', 'a') $$, '42501', null, 'nadie escribe directo');
reset role;

-- El mismo dispositivo, otro usuario: pasa a ser suyo.
select pg_temp.act('b');
select lives_ok($$ select public.save_push_subscription('https://push.example/abc', repeat('k', 40), repeat('a', 16)) $$,
  'si otro inicia sesión en el mismo dispositivo, la suscripción pasa a ser suya');
set local role authenticated;
select is((select count(*)::int from public.push_subscriptions), 1, 'B ve la suscripción');
reset role;
select pg_temp.act('a');
set local role authenticated;
select is((select count(*)::int from public.push_subscriptions), 0, 'y A ya no');
select is((select count(*)::int from public.notification_prefs), 1, 'A sigue viendo solo sus preferencias');
reset role;

select pg_temp.act('b');
select lives_ok($$ select public.delete_push_subscription('https://push.example/abc') $$, 'se da de baja');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/abc'), 0,
  'y la suscripción desaparece');

select is(has_function_privilege('anon', 'public.save_push_subscription(text, text, text, text)', 'execute'), false,
  'sin sesión no se guarda nada');

select * from finish();
rollback;

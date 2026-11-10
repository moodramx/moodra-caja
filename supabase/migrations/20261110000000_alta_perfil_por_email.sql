-- Corrige el alta de usuarios. Supabase Auth inserta primero el usuario y solo
-- después le escribe app_metadata, así que el trigger de INSERT no puede leerla.
-- Ahora el perfil nace del email interno (username@caja.moodra.mx) con los
-- valores de menor privilegio, y admin-users completa nombre, rol, etc.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := split_part(coalesce(new.email, ''), '@', 1);
begin
  if new.email is null or split_part(new.email, '@', 2) <> 'caja.moodra.mx' then
    raise exception 'Los usuarios solo se crean desde admin-users (email interno @caja.moodra.mx)'
      using errcode = 'P0001';
  end if;

  -- El check de profiles.username rechaza usernames inválidos (23514).
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_username);

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

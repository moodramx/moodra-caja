-- Fase 0 — Cimientos: enums base, profiles, app_settings y audit_log.
-- Regla: nunca editar una migración ya aplicada; los cambios van en una nueva.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- UUID v7 (ordenable por tiempo). Postgres 17 no trae uuidv7() nativo.
-- ---------------------------------------------------------------------------
create or replace function public.uuid_v7()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  ts_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  bytes bytea := decode(lpad(to_hex(ts_ms), 12, '0'), 'hex') || extensions.gen_random_bytes(10);
begin
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112); -- versión 7
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128); -- variante RFC 4122
  return encode(bytes, 'hex')::uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('integrante', 'contador');

-- ---------------------------------------------------------------------------
-- profiles: un renglón por usuario de auth. Solo el contador (vía la Edge
-- Function admin-users, con service role) crea o modifica perfiles.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,23}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  color text not null default '#ffffff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji text not null default '🎵',
  role public.user_role not null default 'integrante',
  participa_reparto boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

comment on table public.profiles is 'Integrantes de la banda. id = auth.uid().';

-- ---------------------------------------------------------------------------
-- app_settings: un solo renglón con el contexto activo y los umbrales.
-- active_project_id / active_show_id reciben su FK cuando existan esas tablas.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  active_project_id uuid,
  active_show_id uuid,
  void_window_hours integer not null default 24 check (void_window_hours >= 0),
  cash_alert_threshold_cents bigint not null default 500000 check (cash_alert_threshold_cents >= 0),
  cash_alert_days integer not null default 3 check (cash_alert_days >= 0),
  timezone text not null default 'America/Mexico_City',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- audit_log: bitácora de solo-agregar. Nadie puede editarla ni borrarla.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default public.uuid_v7(),
  actor uuid references public.profiles (id),
  action text not null check (length(action) > 0),
  entity text not null check (length(entity) > 0),
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  device text,
  at timestamptz not null default now()
);

create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create or replace function public.audit_log_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log es de solo-agregar: no se permite %', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_inmutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_inmutable();

-- ---------------------------------------------------------------------------
-- Helpers de rol
-- ---------------------------------------------------------------------------
create or replace function public.is_contador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'contador' and p.activo
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.activo
  );
$$;

-- Registra una acción en la bitácora a nombre del usuario actual.
create or replace function public.log_audit(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_device text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, payload, device)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb), p_device)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta de usuario: al crear un usuario en auth (solo lo hace admin-users con
-- service role) se crea su perfil en la misma transacción, a partir de
-- app_metadata (que el usuario no puede modificar).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  if meta ->> 'username' is null then
    raise exception 'Falta username en app_metadata: los usuarios solo se crean desde admin-users'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, username, display_name, color, emoji, role, participa_reparto, created_by)
  values (
    new.id,
    meta ->> 'username',
    coalesce(meta ->> 'display_name', meta ->> 'username'),
    coalesce(meta ->> 'color', '#ffffff'),
    coalesce(meta ->> 'emoji', '🎵'),
    coalesce((meta ->> 'role')::public.user_role, 'integrante'),
    coalesce((meta ->> 'participa_reparto')::boolean, true),
    nullif(meta ->> 'created_by', '')::uuid
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- RLS: todos los integrantes activos ven todo; nadie escribe directo.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_active_member());

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (public.is_active_member());

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_active_member());

-- Sin políticas de INSERT/UPDATE/DELETE: RLS los niega. Además se revocan los
-- privilegios de tabla para que el error sea explícito.
revoke all on public.profiles, public.app_settings, public.audit_log from anon, authenticated;
grant select on public.profiles, public.app_settings, public.audit_log to authenticated;

revoke execute on function public.log_audit(text, text, text, jsonb, text) from public, anon;
grant execute on function public.log_audit(text, text, text, jsonb, text) to authenticated;

revoke execute on function public.is_contador() from public, anon;
revoke execute on function public.is_active_member() from public, anon;
grant execute on function public.is_contador() to authenticated;
grant execute on function public.is_active_member() to authenticated;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.audit_log_inmutable() from public, anon, authenticated;

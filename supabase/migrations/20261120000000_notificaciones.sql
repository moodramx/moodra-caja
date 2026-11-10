-- Fase 6 — Notificaciones push (Web Push). Cada dispositivo guarda su
-- suscripción; cada usuario puede silenciar tipos de aviso. El envío lo hace la
-- función del servidor `notify`, con la llave privada VAPID en los secrets.

create table public.push_subscriptions (
  id uuid primary key default public.uuid_v7(),
  user_id uuid not null references public.profiles (id),
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id),
  -- Tipos silenciados: entrega_recibida, entrega_respuesta, show_sin_cerrar,
  -- resumen, efectivo_alto, stock, entregas_pendientes.
  muted text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Para no mandar dos veces el mismo aviso (reintentos del cliente o del cron).
create table public.notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;
revoke all on public.push_subscriptions, public.notification_prefs, public.notification_log from anon, authenticated;
grant select on public.push_subscriptions, public.notification_prefs to authenticated;
-- Cada quien ve solo lo suyo; la bitácora de envíos no la lee el cliente.
create policy push_subscriptions_propias on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_prefs_propias on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
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
  if coalesce(p_endpoint, '') !~ '^https://' or length(coalesce(p_p256dh, '')) < 20 or length(coalesce(p_auth, '')) < 8 then
    raise exception 'La suscripción no es válida' using errcode = 'P0001';
  end if;
  -- Un dispositivo pertenece a quien inició sesión en él por última vez.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

create or replace function public.set_notification_muted(p_types text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_types text[];
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_types
  from unnest(coalesce(p_types, '{}')) t
  where t in ('entrega_recibida', 'entrega_respuesta', 'show_sin_cerrar', 'resumen', 'efectivo_alto',
              'stock', 'entregas_pendientes');
  insert into public.notification_prefs (user_id, muted) values ((select auth.uid()), v_types)
  on conflict (user_id) do update set muted = excluded.muted, updated_at = now();
  return v_types;
end;
$$;

revoke execute on function
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text),
  public.set_notification_muted(text[])
from public, anon;
grant execute on function
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text),
  public.set_notification_muted(text[])
to authenticated;

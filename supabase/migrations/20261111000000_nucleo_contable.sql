-- Fase 1 (1/2) — Núcleo contable: catálogo de cuentas, periodos, diario con
-- cuadre obligatorio, y catálogos (categorías, tipos de proyecto, proyectos,
-- contactos). El catálogo va en la migración (no en seed.sql) porque también
-- debe existir en la nube, donde seed.sql no se ejecuta.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto', 'otro');
create type public.account_nature as enum ('deudora', 'acreedora');
create type public.member_account_kind as enum
  ('efectivo', 'por_regresar', 'reparto_por_pagar', 'aportaciones', 'repartos');
create type public.period_status as enum ('abierto', 'cerrado');
create type public.category_kind as enum ('gasto', 'ingreso');
create type public.visible_to as enum ('todos', 'contador');
create type public.project_status as enum ('planeado', 'activo', 'cerrado');
create type public.contact_kind as enum ('venue', 'proveedor', 'tercero', 'boletera', 'otro');

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default public.uuid_v7(),
  code text not null unique check (code ~ '^[0-9]+(\.[0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  type public.account_type not null,
  nature public.account_nature not null,
  parent_id uuid references public.accounts (id),
  member_id uuid references public.profiles (id),
  member_kind public.member_account_kind,
  is_postable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  check ((member_id is null) = (member_kind is null)),
  unique (member_id, member_kind)
);

-- Alta de una cuenta del catálogo; el padre se deduce del código.
create or replace function public.seed_account(
  p_code text, p_name text, p_type public.account_type, p_nature public.account_nature,
  p_postable boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_parent uuid;
  v_id uuid;
begin
  if position('.' in p_code) > 0 then
    select id into v_parent from public.accounts
    where code = regexp_replace(p_code, '\.[0-9]+$', '');
    if v_parent is null then
      raise exception 'Cuenta padre inexistente para %', p_code;
    end if;
  end if;
  insert into public.accounts (code, name, type, nature, parent_id, is_postable)
  values (p_code, p_name, p_type, p_nature, v_parent, p_postable)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.seed_account(text, text, public.account_type, public.account_nature, boolean)
  from public, anon, authenticated;

select public.seed_account(c.code, c.name, c.type::public.account_type, c.nature::public.account_nature, c.postable)
from (values
  ('1', 'ACTIVO', 'activo', 'deudora', false),
  ('1.1', 'Efectivo', 'activo', 'deudora', false),
  ('1.1.01', 'Caja Moodra', 'activo', 'deudora', true),
  ('1.2', 'Bancos', 'activo', 'deudora', false),
  ('1.2.01', 'Cuenta Moodra', 'activo', 'deudora', true),
  ('1.3', 'Por cobrar', 'activo', 'deudora', false),
  ('1.3.01', 'Venues', 'activo', 'deudora', true),
  ('1.3.02', 'Boleteras', 'activo', 'deudora', true),
  ('1.3.99', 'Otros por cobrar', 'activo', 'deudora', true),
  ('1.4', 'Inventario de merch', 'activo', 'deudora', false),
  ('1.4.01', 'Playeras', 'activo', 'deudora', true),
  ('1.4.02', 'Vinilos y CD', 'activo', 'deudora', true),
  ('1.4.03', 'Stickers', 'activo', 'deudora', true),
  ('1.4.04', 'Pines', 'activo', 'deudora', true),
  ('1.4.05', 'Canas', 'activo', 'deudora', true),
  ('1.4.99', 'Otros', 'activo', 'deudora', true),
  ('1.5', 'Anticipos a proveedores', 'activo', 'deudora', true),
  ('2', 'PASIVO', 'pasivo', 'acreedora', false),
  ('2.1', 'Por regresar a integrantes', 'pasivo', 'acreedora', false),
  ('2.2', 'Proveedores y terceros por pagar', 'pasivo', 'acreedora', true),
  ('2.3', 'Cobros anticipados de shows', 'pasivo', 'acreedora', true),
  ('2.4', 'Repartos por pagar', 'pasivo', 'acreedora', false),
  ('3', 'FONDO MOODRA', 'patrimonio', 'acreedora', false),
  ('3.1', 'Aportaciones', 'patrimonio', 'acreedora', false),
  ('3.2', 'Repartos', 'patrimonio', 'deudora', false),
  ('3.3', 'Resultados acumulados', 'patrimonio', 'acreedora', true),
  ('3.4', 'Resultado del ejercicio', 'patrimonio', 'acreedora', true),
  ('4', 'INGRESOS', 'ingreso', 'acreedora', false),
  ('4.1', 'Shows', 'ingreso', 'acreedora', false),
  ('4.1.01', 'Fee fijo', 'ingreso', 'acreedora', true),
  ('4.1.02', '% de taquilla', 'ingreso', 'acreedora', true),
  ('4.1.03', 'Boletaje propio', 'ingreso', 'acreedora', true),
  ('4.2', 'Merch', 'ingreso', 'acreedora', false),
  ('4.2.01', 'Playeras', 'ingreso', 'acreedora', true),
  ('4.2.02', 'Vinilos y CD', 'ingreso', 'acreedora', true),
  ('4.2.03', 'Stickers', 'ingreso', 'acreedora', true),
  ('4.2.04', 'Pines', 'ingreso', 'acreedora', true),
  ('4.2.05', 'Canas', 'ingreso', 'acreedora', true),
  ('4.2.99', 'Otros', 'ingreso', 'acreedora', true),
  ('4.3', 'Música', 'ingreso', 'acreedora', false),
  ('4.3.01', 'Streaming (DistroKid)', 'ingreso', 'acreedora', true),
  ('4.3.02', 'Bandcamp (digital)', 'ingreso', 'acreedora', true),
  ('4.4', 'Patrocinios y apoyos', 'ingreso', 'acreedora', true),
  ('4.5', 'Sync y licencias', 'ingreso', 'acreedora', true),
  ('4.9', 'Otros ingresos', 'ingreso', 'acreedora', true),
  ('5', 'COSTOS DIRECTOS', 'costo', 'deudora', false),
  ('5.1', 'Costo de venta de merch', 'costo', 'deudora', true),
  ('5.2', 'Comisiones (boleteras y plataformas)', 'costo', 'deudora', true),
  ('5.3', 'Costos de show', 'costo', 'deudora', false),
  ('5.3.01', 'Transporte y gasolina', 'costo', 'deudora', true),
  ('5.3.02', 'Casetas y estacionamiento', 'costo', 'deudora', true),
  ('5.3.03', 'Hospedaje', 'costo', 'deudora', true),
  ('5.3.04', 'Comida y viáticos', 'costo', 'deudora', true),
  ('5.3.05', 'Backline y renta de equipo', 'costo', 'deudora', true),
  ('5.3.06', 'Ingeniero, staff y terceros', 'costo', 'deudora', true),
  ('5.3.07', 'Producción en vivo (visuales, luces)', 'costo', 'deudora', true),
  ('5.3.99', 'Otros costos de show', 'costo', 'deudora', true),
  ('6', 'GASTOS DE OPERACIÓN', 'gasto', 'deudora', false),
  ('6.01', 'Equipo menor y mantenimiento', 'gasto', 'deudora', true),
  ('6.02', 'Producción musical', 'gasto', 'deudora', true),
  ('6.03', 'Video y fotografía', 'gasto', 'deudora', true),
  ('6.04', 'Diseño y arte', 'gasto', 'deudora', true),
  ('6.05', 'Promoción y publicidad', 'gasto', 'deudora', true),
  ('6.06', 'Distribución digital', 'gasto', 'deudora', true),
  ('6.07', 'Software y suscripciones', 'gasto', 'deudora', true),
  ('6.08', 'Inscripciones a convocatorias y festivales', 'gasto', 'deudora', true),
  ('6.09', 'Sueldo del becario', 'gasto', 'deudora', true),
  ('6.10', 'Trámites y administración', 'gasto', 'deudora', true),
  ('6.99', 'Otros gastos', 'gasto', 'deudora', true),
  ('7', 'OTROS', 'otro', 'deudora', false),
  ('7.1', 'Merch regalado y cortesías', 'otro', 'deudora', true),
  ('7.2', 'Mermas y faltantes de inventario', 'otro', 'deudora', true),
  ('7.3', 'Diferencias de caja', 'otro', 'deudora', true),
  ('7.4', 'Comisiones bancarias', 'otro', 'deudora', true)
) as c(code, name, type, nature, postable);

create or replace function public.account_id(p_code text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.accounts where code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Subcuentas por integrante: se crean solas al dar de alta un perfil.
--   1.1.1N efectivo en su poder · 2.1.NN por regresarle · 2.4.NN reparto por
--   pagarle · 3.1.NN sus aportaciones · 3.2.NN sus repartos
-- ---------------------------------------------------------------------------
create or replace function public.ensure_member_accounts(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_n integer;
  k record;
begin
  if exists (select 1 from public.accounts where member_id = p_member) then
    return;
  end if;
  select display_name into v_name from public.profiles where id = p_member;
  perform pg_advisory_xact_lock(hashtext('moodra.member_accounts'));
  select count(*) + 1 into v_n from public.accounts where member_kind = 'efectivo';

  for k in
    select * from (values
      ('efectivo'::public.member_account_kind, '1.1', '1.1.' || (10 + v_n), 'Efectivo en poder de ',
       'activo'::public.account_type, 'deudora'::public.account_nature),
      ('por_regresar', '2.1', '2.1.' || lpad(v_n::text, 2, '0'), 'Por regresar a ', 'pasivo', 'acreedora'),
      ('reparto_por_pagar', '2.4', '2.4.' || lpad(v_n::text, 2, '0'), 'Reparto por pagar a ', 'pasivo', 'acreedora'),
      ('aportaciones', '3.1', '3.1.' || lpad(v_n::text, 2, '0'), 'Aportaciones de ', 'patrimonio', 'acreedora'),
      ('repartos', '3.2', '3.2.' || lpad(v_n::text, 2, '0'), 'Repartos a ', 'patrimonio', 'deudora')
    ) as t(kind, parent_code, code, prefix, type, nature)
  loop
    insert into public.accounts (code, name, type, nature, parent_id, member_id, member_kind)
    values (k.code, k.prefix || v_name, k.type, k.nature, public.account_id(k.parent_code), p_member, k.kind);
  end loop;
end;
$$;
revoke execute on function public.ensure_member_accounts(uuid) from public, anon, authenticated;

create or replace function public.profiles_member_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_member_accounts(new.id);
  elsif new.display_name is distinct from old.display_name then
    -- El nombre de la cuenta sigue al nombre del integrante.
    update public.accounts a
    set name = case a.member_kind
        when 'efectivo' then 'Efectivo en poder de '
        when 'por_regresar' then 'Por regresar a '
        when 'reparto_por_pagar' then 'Reparto por pagar a '
        when 'aportaciones' then 'Aportaciones de '
        else 'Repartos a '
      end || new.display_name
    where a.member_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_member_accounts() from public, anon, authenticated;

create trigger profiles_member_accounts
  after insert or update of display_name on public.profiles
  for each row execute function public.profiles_member_accounts();

-- Integrantes que ya existían antes de esta migración.
select public.ensure_member_accounts(p.id) from public.profiles p order by p.created_at;

create or replace function public.member_account(p_member uuid, p_kind public.member_account_kind)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.accounts where member_id = p_member and member_kind = p_kind;
$$;

-- ---------------------------------------------------------------------------
-- Periodos mensuales
-- ---------------------------------------------------------------------------
create table public.periods (
  id uuid primary key default public.uuid_v7(),
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  status public.period_status not null default 'abierto',
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default public.uuid_v7(),
  slug text not null unique,
  name text not null,
  emoji text not null,
  kind public.category_kind not null,
  account_show_id uuid references public.accounts (id),
  account_general_id uuid not null references public.accounts (id),
  sort integer not null default 0,
  is_extra boolean not null default false,
  visible_to public.visible_to not null default 'todos',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

insert into public.categories (slug, name, emoji, kind, account_show_id, account_general_id, sort, is_extra, visible_to)
select c.slug, c.name, c.emoji, c.kind::public.category_kind, public.account_id(c.show_code),
       public.account_id(c.general_code), c.sort, c.is_extra, c.visible_to::public.visible_to
from (values
  ('transporte', 'Transporte', '⛽', 'gasto', '5.3.01', '6.99', 10, false, 'todos'),
  ('comida', 'Comida', '🍔', 'gasto', '5.3.04', '6.99', 20, false, 'todos'),
  ('hospedaje', 'Hospedaje', '🏨', 'gasto', '5.3.03', '6.99', 30, false, 'todos'),
  ('equipo', 'Equipo', '🎸', 'gasto', '5.3.05', '6.01', 40, false, 'todos'),
  ('produccion', 'Producción', '🎛️', 'gasto', '5.3.07', '6.02', 50, false, 'todos'),
  ('promo', 'Promo', '📣', 'gasto', '6.05', '6.05', 60, false, 'todos'),
  ('otro-gasto', 'Otro', '🧾', 'gasto', '5.3.99', '6.99', 70, false, 'todos'),
  ('staff', 'Staff y terceros', '🙋', 'gasto', '5.3.06', '5.3.06', 110, true, 'todos'),
  ('casetas', 'Casetas y estacionamiento', '🛣️', 'gasto', '5.3.02', '5.3.02', 120, true, 'todos'),
  ('video-foto', 'Video y foto', '🎬', 'gasto', '6.03', '6.03', 130, true, 'todos'),
  ('diseno', 'Diseño', '🎨', 'gasto', '6.04', '6.04', 140, true, 'todos'),
  ('software', 'Software', '💻', 'gasto', '6.07', '6.07', 150, true, 'todos'),
  ('inscripcion', 'Inscripción a convocatoria', '🎟️', 'gasto', '6.08', '6.08', 160, true, 'todos'),
  ('sueldo-becario', 'Sueldo becario', '🎓', 'gasto', '6.09', '6.09', 170, true, 'contador'),
  ('musica-streaming', 'Streaming (DistroKid)', '🎵', 'ingreso', null, '4.3.01', 10, false, 'todos'),
  ('musica-bandcamp', 'Bandcamp digital', '💿', 'ingreso', null, '4.3.02', 20, false, 'todos'),
  ('patrocinio', 'Patrocinio o apoyo', '🤝', 'ingreso', null, '4.4', 30, false, 'todos'),
  ('sync', 'Sync o licencia', '🎬', 'ingreso', null, '4.5', 40, false, 'todos'),
  ('otro-ingreso', 'Otro', '🧾', 'ingreso', null, '4.9', 50, false, 'todos')
) as c(slug, name, emoji, kind, show_code, general_code, sort, is_extra, visible_to);

create table public.project_types (
  id uuid primary key default public.uuid_v7(),
  code text not null unique check (code ~ '^[A-Z]{3}$'),
  name text not null,
  emoji text not null default '📁',
  -- true: lo capturado en este tipo de proyecto usa las cuentas de costo de show (5.3)
  is_show boolean not null default false,
  sort integer not null default 0
);

insert into public.project_types (code, name, emoji, is_show, sort) values
  ('OPE', 'Operación general', '🏠', false, 0),
  ('GIR', 'Gira', '🚐', true, 10),
  ('SHW', 'Show suelto', '🎸', true, 20),
  ('GRA', 'Grabación (EP / álbum)', '🎙️', false, 30),
  ('LAN', 'Lanzamiento de single', '🚀', false, 40),
  ('VID', 'Videoclip', '🎬', false, 50),
  ('SES', 'Live session / streaming', '📹', false, 60),
  ('FOT', 'Sesión de fotos / arte', '📸', false, 70),
  ('MER', 'Producción de merch (drop)', '👕', false, 80),
  ('CON', 'Convocatoria / beca / apoyo', '🎟️', false, 90),
  ('INT', 'Festival o viaje internacional', '✈️', true, 100),
  ('EQP', 'Inversión en equipo', '🎛️', false, 110);

create table public.projects (
  id uuid primary key default public.uuid_v7(),
  code text not null unique,
  type_id uuid not null references public.project_types (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  start_date date,
  end_date date,
  budget_cents bigint check (budget_cents is null or budget_cents >= 0),
  status public.project_status not null default 'activo',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

alter table public.app_settings
  add constraint app_settings_active_project_fkey
  foreign key (active_project_id) references public.projects (id);

create table public.contacts (
  id uuid primary key default public.uuid_v7(),
  name text not null check (length(btrim(name)) between 1 and 80),
  kind public.contact_kind not null default 'otro',
  city text,
  phone text,
  notes text,
  -- Campos fiscales opcionales para un futuro CFDI (PRD §9)
  rfc text,
  razon_social text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- ---------------------------------------------------------------------------
-- Diario
-- ---------------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default public.uuid_v7(),
  number bigint generated always as identity unique,
  date date not null,
  period_id uuid not null references public.periods (id),
  description text not null,
  source_event_id uuid,
  reverses_entry_id uuid unique references public.journal_entries (id),
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- Un evento, un asiento (más, si se anula, su reversa).
create unique index journal_entries_one_per_event
  on public.journal_entries (source_event_id) where reverses_entry_id is null;
create index journal_entries_date_idx on public.journal_entries (date);

create table public.journal_lines (
  id uuid primary key default public.uuid_v7(),
  entry_id uuid not null references public.journal_entries (id),
  account_id uuid not null references public.accounts (id),
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  member_id uuid references public.profiles (id),
  project_id uuid references public.projects (id),
  show_id uuid,
  variant_id uuid,
  memo text,
  check ((debit_cents > 0) <> (credit_cents > 0))
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);
create index journal_lines_project_idx on public.journal_lines (project_id) where project_id is not null;

-- Cuadre: Σ debe = Σ haber, validado al final de la transacción.
create or replace function public.check_entry_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Sirve para journal_entries (id) y journal_lines (entry_id).
  v_entry uuid := coalesce((to_jsonb(new) ->> 'entry_id')::uuid, new.id);
  v_debit bigint;
  v_credit bigint;
  v_lines integer;
begin
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0), count(*)
  into v_debit, v_credit, v_lines
  from public.journal_lines where entry_id = v_entry;

  if v_lines < 2 then
    raise exception 'El asiento % debe tener al menos dos líneas', v_entry using errcode = 'P0001';
  end if;
  if v_debit <> v_credit then
    raise exception 'El asiento % no cuadra: debe % ≠ haber %', v_entry, v_debit, v_credit
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger journal_entries_balanced
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function public.check_entry_balanced();

create constraint trigger journal_lines_balanced
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.check_entry_balanced();

-- Solo se postea a cuentas de detalle activas.
create or replace function public.check_line_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.is_postable and a.active
  ) then
    raise exception 'La cuenta % no admite movimientos', new.account_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger journal_lines_account_check
  before insert on public.journal_lines
  for each row execute function public.check_line_account();

-- Inmutabilidad: el diario no se edita ni se borra, ni con rol privilegiado.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% es inmutable: no se permite %. Para corregir, anula y vuelve a capturar.',
    tg_table_name, tg_op using errcode = 'P0001';
end;
$$;

create trigger journal_entries_immutable before update or delete on public.journal_entries
  for each row execute function public.forbid_mutation();
create trigger journal_entries_no_truncate before truncate on public.journal_entries
  for each statement execute function public.forbid_mutation();
create trigger journal_lines_immutable before update or delete on public.journal_lines
  for each row execute function public.forbid_mutation();
create trigger journal_lines_no_truncate before truncate on public.journal_lines
  for each statement execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS: todos los integrantes activos leen todo; nadie escribe directo.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'periods', 'categories', 'project_types', 'projects',
                           'contacts', 'journal_entries', 'journal_lines']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_member())',
      t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

revoke execute on function public.check_entry_balanced() from public, anon, authenticated;
revoke execute on function public.check_line_account() from public, anon, authenticated;
revoke execute on function public.forbid_mutation() from public, anon, authenticated;
revoke execute on function public.account_id(text) from public, anon;
revoke execute on function public.member_account(uuid, public.member_account_kind) from public, anon;

-- ---------------------------------------------------------------------------
-- Proyectos y contexto activo
-- ---------------------------------------------------------------------------
-- Alta de proyecto (solo contador). La clave se genera sola: GIR-2026-03.
create or replace function public.create_project(
  p_type_code text, p_name text, p_start date default null, p_end date default null,
  p_budget_cents bigint default null, p_notes text default null
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.project_types;
  v_year integer;
  v_seq integer;
  v_row public.projects;
begin
  if not public.is_contador() then
    raise exception 'Solo el contador puede crear proyectos' using errcode = '42501';
  end if;
  select * into v_type from public.project_types where code = p_type_code;
  if v_type.id is null then
    raise exception 'Tipo de proyecto desconocido: %', p_type_code using errcode = 'P0001';
  end if;

  v_year := extract(year from coalesce(p_start, (now() at time zone 'America/Mexico_City')::date));
  perform pg_advisory_xact_lock(hashtext('moodra.project_code'));
  select count(*) + 1 into v_seq from public.projects
  where code like v_type.code || '-' || v_year || '-%';

  insert into public.projects (code, type_id, name, start_date, end_date, budget_cents, notes, created_by)
  values (v_type.code || '-' || v_year || '-' || lpad(v_seq::text, 2, '0'), v_type.id, btrim(p_name),
          p_start, p_end, p_budget_cents, p_notes, (select auth.uid()))
  returning * into v_row;

  perform public.log_audit('project.create', 'projects', v_row.id::text,
    jsonb_build_object('code', v_row.code, 'name', v_row.name));
  return v_row;
end;
$$;

-- "Estamos en…": cualquier integrante cambia el contexto activo (null = operación general).
create or replace function public.set_active_context(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and status <> 'cerrado'
  ) then
    raise exception 'Ese proyecto no existe o ya está cerrado' using errcode = 'P0001';
  end if;

  update public.app_settings
  set active_project_id = p_project_id, updated_at = now(), updated_by = (select auth.uid())
  where id;

  perform public.log_audit('context.set', 'app_settings', null,
    jsonb_build_object('project_id', p_project_id));
end;
$$;

revoke execute on function public.create_project(text, text, date, date, bigint, text) from public, anon;
revoke execute on function public.set_active_context(uuid) from public, anon;
grant execute on function public.create_project(text, text, date, date, bigint, text) to authenticated;
grant execute on function public.set_active_context(uuid) to authenticated;

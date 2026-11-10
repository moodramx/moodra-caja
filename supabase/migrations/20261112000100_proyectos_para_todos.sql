-- Cualquier integrante activo puede dar de alta giras, shows y proyectos
-- (decisión de Diego del 2026-11-10; antes era solo el contador, PRD §7).
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
  if not public.is_active_member() then
    raise exception 'Usuario no autorizado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Ponle nombre al proyecto' using errcode = 'P0001';
  end if;
  select * into v_type from public.project_types where code = p_type_code;
  if v_type.id is null or v_type.code = 'OPE' then
    raise exception 'Elige qué tipo de proyecto es' using errcode = 'P0001';
  end if;
  -- El presupuesto lo fija el contador.
  if p_budget_cents is not null and not public.is_contador() then
    raise exception 'Solo el contador pone presupuesto' using errcode = '42501';
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

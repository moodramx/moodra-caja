-- Tipo de proyecto "Ensayos" y el proyecto permanente "Ensayos generales"
-- (pedido por Diego), para asignarle renta de sala, cuerdas, etc.
insert into public.project_types (code, name, emoji, is_show, sort)
values ('ENS', 'Ensayos', '🥁', false, 25);

insert into public.projects (code, type_id, name, status)
select 'ENS-2026-01', id, 'Ensayos generales', 'activo'
from public.project_types where code = 'ENS';

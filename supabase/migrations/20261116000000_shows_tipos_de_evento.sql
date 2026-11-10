-- Fase 3 (1/2) — Tipos de evento de shows. En su propia migración porque un
-- valor nuevo de enum no puede usarse en la misma transacción.
alter type public.event_type add value if not exists 'cierre_show';
alter type public.event_type add value if not exists 'anticipo_show';
alter type public.event_type add value if not exists 'cobro_pendiente';

-- Fase 5b — valores nuevos de catálogo (aparte: un valor de enum no puede
-- usarse en la misma transacción en que se crea).
alter type public.event_type add value if not exists 'reparto';
alter type public.event_type add value if not exists 'pago_reparto';
alter type public.event_type add value if not exists 'arqueo';
alter type public.event_type add value if not exists 'asiento_manual';

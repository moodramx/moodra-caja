-- Transporte — valores nuevos de catálogo (van aparte porque un valor de enum
-- no puede usarse en la misma transacción en que se crea).
alter type public.event_type add value if not exists 'viaje';
alter type public.event_type add value if not exists 'pago_transporte';
alter type public.member_account_kind add value if not exists 'transporte';

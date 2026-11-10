-- Fase 2 (1/2) — Nuevos tipos de evento para merch. Van en su propia migración
-- porque un valor nuevo de enum no puede usarse en la misma transacción.
alter type public.event_type add value if not exists 'venta_merch';
alter type public.event_type add value if not exists 'compra_merch';
alter type public.event_type add value if not exists 'salida_merch';
alter type public.event_type add value if not exists 'ajuste_inventario';

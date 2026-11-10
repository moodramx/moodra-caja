-- "Show en vivo" como opción de Cobré (pedido por Diego). Por ahora es un cobro
-- simple a 4.1.01; en la Fase 3 el cierre de show distinguirá fee fijo,
-- % de taquilla y boletaje propio (4.1.01 / 4.1.02 / 4.1.03).
insert into public.categories (slug, name, emoji, kind, account_general_id, sort)
values ('show-en-vivo', 'Show en vivo', '🎤', 'ingreso', public.account_id('4.1.01'), 5);

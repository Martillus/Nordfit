-- NORDFIT · 7/7 · Tarea diaria
-- Cada día a las 03:00 (UTC) se generan las sesiones del mes actual y del siguiente
-- y se crean los cargos pendientes del mes. Es idempotente: si ya existen, no hace nada.
create extension if not exists pg_cron;
select cron.schedule('nordfit-ensure-months', '0 3 * * *', $$select public.ensure_months()$$);

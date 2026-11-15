-- NORDFIT · 1/7 · Extensiones, tipos y utilidades comunes
-- Convenciones de todo el esquema:
--   · Días de la semana en formato ISO: 1 = lunes … 7 = domingo.
--   · Horas como hora de inicio de la sesión (0–23). Las sesiones duran settings.session_minutes.
--   · Los meses se guardan como fecha del día 1 (2026-11-01 = noviembre de 2026).
--   · Importes en euros con IVA incluido, numeric(8,2).

create extension if not exists citext with schema extensions;

-- Esquema interno: funciones auxiliares que no se exponen en la API
create schema if not exists private;
grant usage on schema private to authenticated;

create type public.staff_role     as enum ('owner', 'trainer');
create type public.payment_method as enum ('bizum', 'transfer', 'cash');
create type public.payment_status as enum ('pending', 'paid');
create type public.booking_status as enum ('scheduled', 'cancelled', 'late_cancelled');
create type public.booking_source as enum ('schedule', 'request', 'admin');
create type public.request_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');

comment on type public.booking_status is 'scheduled: sesión vigente · cancelled: anulada sin coste · late_cancelled: anulada con menos antelación de la permitida, se descuenta del bono';
comment on type public.booking_source is 'schedule: creada a partir del horario fijo · request: creada al aceptar una solicitud · admin: creada a mano desde el panel';

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- NORDFIT · 6/7 · Configuración inicial
-- Solo datos ya acordados para el software. Sin clientes ni datos de ejemplo:
-- los clientes reales se cargan desde el panel o con el Excel del dueño.
-- Pendiente de que el dueño lo confirme o lo complete: emails del equipo, turnos, IBAN, titular y Bizum.

insert into public.settings (id, studio_name, timezone, session_minutes, cancel_hours, min_change_hours, whatsapp_phone)
values (true, 'Nordfit', 'Europe/Madrid', 60, 24, 2, '+34 687 38 69 17');

insert into public.plans (code, name, short_name, monthly_price, single_price, sessions_per_month, is_group, sort_order) values
  ('personal', 'Personal 1:1',   '1:1',    360, 50, 8, false, 1),
  ('pareja',   'En pareja',      'Pareja', 240, 35, 8, false, 2),
  ('grupo',    'Grupo reducido', 'Grupo',  120, 25, 8, true,  3);

insert into public.staff (name, role, title) values
  ('Sergio',   'owner',   'dueño'),
  ('Verónica', 'trainer', 'entrenadora'),
  ('Jesús',    'trainer', 'entrenador');

-- Horario de apertura (horas de inicio de la primera y la última sesión). Domingo cerrado.
insert into public.studio_hours (weekday, first_hour, last_hour) values
  (1, 7, 21), (2, 7, 21), (3, 7, 21), (4, 7, 21), (5, 7, 21), (6, 9, 13);

-- Turnos orientativos (los del prototipo), a confirmar con el dueño
insert into public.staff_shifts (staff_id, weekday, first_hour, last_hour)
select s.id, t.weekday, t.first_hour, t.last_hour
from public.staff s
join (values
  ('Sergio',   1, 7, 14), ('Sergio',   2, 7, 14), ('Sergio',   3, 7, 14), ('Sergio',   4, 7, 14), ('Sergio',   5, 7, 14), ('Sergio', 6, 9, 13),
  ('Verónica', 1, 14, 21), ('Verónica', 2, 14, 21), ('Verónica', 3, 14, 21), ('Verónica', 4, 14, 21), ('Verónica', 5, 14, 21),
  ('Jesús',    1, 9, 16), ('Jesús',    2, 9, 16), ('Jesús',    3, 9, 16), ('Jesús',    4, 9, 16), ('Jesús',    5, 9, 16), ('Jesús', 6, 9, 13)
) as t(name, weekday, first_hour, last_hour) on t.name = s.name;

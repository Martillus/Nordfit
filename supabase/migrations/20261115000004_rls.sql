-- NORDFIT · 4/7 · Permisos (Row Level Security)
-- Sin sesión (anon) no se ve nada. Cliente: solo lo suyo. Entrenador: su agenda y sus clientes.
-- Dueño: todo. Las acciones con reglas (cancelar, pedir cambio, decidir…) van por funciones (5/7).

alter table public.settings          enable row level security;
alter table public.plans             enable row level security;
alter table public.staff             enable row level security;
alter table public.studio_hours      enable row level security;
alter table public.staff_shifts      enable row level security;
alter table public.class_groups      enable row level security;
alter table public.clients           enable row level security;
alter table public.client_schedule   enable row level security;
alter table public.closures          enable row level security;
alter table public.staff_absences    enable row level security;
alter table public.bookings          enable row level security;
alter table public.change_requests   enable row level security;
alter table public.payments          enable row level security;
alter table public.payment_reminders enable row level security;
alter table public.audit_log         enable row level security;

-- La API pública (anon) no tiene acceso a ninguna tabla
revoke all on all tables in schema public from anon;

-- ---------- Catálogo: lo lee cualquiera con sesión; lo edita el dueño ----------
create policy "settings: leer con sesión" on public.settings for select to authenticated using (true);
create policy "settings: dueño edita"     on public.settings for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));

create policy "plans: leer con sesión" on public.plans for select to authenticated using (true);
create policy "plans: dueño inserta"   on public.plans for insert to authenticated with check ((select private.is_owner()));
create policy "plans: dueño edita"     on public.plans for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "plans: dueño borra"     on public.plans for delete to authenticated using ((select private.is_owner()));

create policy "staff: leer con sesión" on public.staff for select to authenticated using (true);
create policy "staff: dueño inserta"   on public.staff for insert to authenticated with check ((select private.is_owner()));
create policy "staff: dueño edita"     on public.staff for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "staff: dueño borra"     on public.staff for delete to authenticated using ((select private.is_owner()));

create policy "studio_hours: leer con sesión" on public.studio_hours for select to authenticated using (true);
create policy "studio_hours: dueño inserta"   on public.studio_hours for insert to authenticated with check ((select private.is_owner()));
create policy "studio_hours: dueño edita"     on public.studio_hours for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "studio_hours: dueño borra"     on public.studio_hours for delete to authenticated using ((select private.is_owner()));

create policy "staff_shifts: leer con sesión" on public.staff_shifts for select to authenticated using (true);
create policy "staff_shifts: dueño inserta"   on public.staff_shifts for insert to authenticated with check ((select private.is_owner()));
create policy "staff_shifts: dueño edita"     on public.staff_shifts for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "staff_shifts: dueño borra"     on public.staff_shifts for delete to authenticated using ((select private.is_owner()));

create policy "class_groups: leer con sesión" on public.class_groups for select to authenticated using (true);
create policy "class_groups: dueño inserta"   on public.class_groups for insert to authenticated with check ((select private.is_owner()));
create policy "class_groups: dueño edita"     on public.class_groups for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "class_groups: dueño borra"     on public.class_groups for delete to authenticated using ((select private.is_owner()));

create policy "closures: leer con sesión" on public.closures for select to authenticated using (true);
create policy "closures: dueño inserta"   on public.closures for insert to authenticated with check ((select private.is_owner()));
create policy "closures: dueño edita"     on public.closures for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "closures: dueño borra"     on public.closures for delete to authenticated using ((select private.is_owner()));

-- ---------- Ausencias: las ve el equipo; cada uno gestiona las suyas, el dueño todas ----------
create policy "absences: equipo lee" on public.staff_absences for select to authenticated using ((select private.is_staff()));
create policy "absences: crear propias o dueño" on public.staff_absences for insert to authenticated
  with check ((select private.is_owner()) or staff_id = (select private.my_staff_id()));
create policy "absences: editar propias o dueño" on public.staff_absences for update to authenticated
  using ((select private.is_owner()) or staff_id = (select private.my_staff_id()))
  with check ((select private.is_owner()) or staff_id = (select private.my_staff_id()));
create policy "absences: borrar propias o dueño" on public.staff_absences for delete to authenticated
  using ((select private.is_owner()) or staff_id = (select private.my_staff_id()));

-- ---------- Clientes ----------
create policy "clients: leer" on public.clients for select to authenticated using (
  (select private.is_owner())
  or id = (select private.my_client_id())
  or partner_id = (select private.my_client_id())
  or private.trainer_sees_client(id)
);
create policy "clients: dueño inserta" on public.clients for insert to authenticated with check ((select private.is_owner()));
create policy "clients: dueño edita"   on public.clients for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "clients: dueño borra"   on public.clients for delete to authenticated using ((select private.is_owner()));

create policy "client_schedule: leer" on public.client_schedule for select to authenticated using (
  (select private.is_owner())
  or client_id = (select private.my_client_id())
  or trainer_id = (select private.my_staff_id())
  or private.trainer_sees_client(client_id)
);
create policy "client_schedule: dueño inserta" on public.client_schedule for insert to authenticated with check ((select private.is_owner()));
create policy "client_schedule: dueño edita"   on public.client_schedule for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "client_schedule: dueño borra"   on public.client_schedule for delete to authenticated using ((select private.is_owner()));

-- ---------- Sesiones ----------
create policy "bookings: leer" on public.bookings for select to authenticated using (
  (select private.is_owner())
  or client_id = (select private.my_client_id())
  or trainer_id = (select private.my_staff_id())
);
create policy "bookings: dueño inserta" on public.bookings for insert to authenticated with check ((select private.is_owner()));
create policy "bookings: dueño edita"   on public.bookings for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "bookings: dueño borra"   on public.bookings for delete to authenticated using ((select private.is_owner()));

-- ---------- Solicitudes ----------
create policy "requests: leer" on public.change_requests for select to authenticated using (
  (select private.is_owner())
  or client_id = (select private.my_client_id())
  or approver_id = (select private.my_staff_id())
);
create policy "requests: dueño edita" on public.change_requests for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "requests: dueño borra" on public.change_requests for delete to authenticated using ((select private.is_owner()));

-- ---------- Pagos: el cliente ve los suyos; el dueño todo. Los entrenadores no ven pagos ----------
create policy "payments: leer" on public.payments for select to authenticated using (
  (select private.is_owner()) or client_id = (select private.my_client_id())
);
create policy "payments: dueño inserta" on public.payments for insert to authenticated with check ((select private.is_owner()));
create policy "payments: dueño edita"   on public.payments for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "payments: dueño borra"   on public.payments for delete to authenticated using ((select private.is_owner()));

create policy "reminders: dueño lee"     on public.payment_reminders for select to authenticated using ((select private.is_owner()));
create policy "reminders: dueño inserta" on public.payment_reminders for insert to authenticated with check ((select private.is_owner()));
create policy "reminders: dueño borra"   on public.payment_reminders for delete to authenticated using ((select private.is_owner()));

-- ---------- Registro de cambios: solo lectura para el dueño ----------
create policy "audit: dueño lee" on public.audit_log for select to authenticated using ((select private.is_owner()));
revoke insert, update, delete, truncate on public.audit_log from authenticated;

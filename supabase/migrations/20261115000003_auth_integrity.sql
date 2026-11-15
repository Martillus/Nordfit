-- NORDFIT · 3/7 · Quién es quién, integridad y registro de cambios

-- ---------- Funciones de identidad (usadas por las políticas RLS) ----------
create or replace function private.my_staff_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.staff where user_id = (select auth.uid()) and active
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()) and active and role = 'owner')
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()) and active)
$$;

create or replace function private.my_client_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.clients where user_id = (select auth.uid()) and active
$$;

-- ¿Puede este entrenador ver a este cliente? (es su entrenador, tiene sesiones o horario con él)
create or replace function private.trainer_sees_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and (
      exists (select 1 from public.clients c where c.id = p_client and c.trainer_id = s.id)
      or exists (select 1 from public.client_schedule cs where cs.client_id = p_client and cs.trainer_id = s.id)
      or exists (select 1 from public.bookings b where b.client_id = p_client and b.trainer_id = s.id)
      or exists (select 1 from public.change_requests r where r.client_id = p_client and r.approver_id = s.id)
    )
  )
$$;

grant execute on function private.my_staff_id(), private.is_owner(), private.is_staff(), private.my_client_id(), private.trainer_sees_client(uuid) to authenticated;

-- ---------- Enlace automático de cuentas por email ----------
-- Cuando alguien entra por primera vez (enlace mágico), su cuenta se une a su ficha de cliente o de equipo.
create or replace function private.link_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.clients set user_id = new.id where email = new.email::extensions.citext and user_id is null;
  update public.staff   set user_id = new.id where email = new.email::extensions.citext and user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.link_auth_user();

-- Y al revés: si se crea o cambia el email de una ficha y esa cuenta ya existe, se enlaza.
create or replace function private.link_profile_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    new.user_id := (select u.id from auth.users u where u.email::extensions.citext = new.email limit 1);
  end if;
  return new;
end $$;
create trigger clients_link_user before insert or update of email on public.clients
  for each row execute function private.link_profile_user();
create trigger staff_link_user before insert or update of email on public.staff
  for each row execute function private.link_profile_user();

-- ---------- Parejas simétricas ----------
-- Si A entrena con B, B entrena con A. Al cambiar o quitar la pareja, la otra parte se actualiza.
create or replace function private.sync_partner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.partner_id is not null and old.partner_id is distinct from new.partner_id then
    update public.clients set partner_id = null where id = old.partner_id and partner_id = new.id;
  end if;
  if new.partner_id is not null then
    -- La nueva pareja deja a su pareja anterior
    update public.clients set partner_id = null
      where partner_id = new.partner_id and id <> new.id;
    update public.clients set partner_id = new.id
      where id = new.partner_id and partner_id is distinct from new.id;
  end if;
  return null;
end $$;
create trigger clients_sync_partner after insert or update of partner_id on public.clients
  for each row execute function private.sync_partner();

-- ---------- Coherencia de horarios ----------
-- Un hueco de grupo debe coincidir con el grupo (día, hora y entrenador).
create or replace function private.check_schedule_group()
returns trigger language plpgsql set search_path = '' as $$
declare g public.class_groups;
begin
  if new.group_id is not null then
    select * into g from public.class_groups where id = new.group_id;
    if g.weekday <> new.weekday or g.start_hour <> new.start_hour then
      raise exception 'El horario no coincide con el del grupo' using errcode = 'check_violation';
    end if;
    new.trainer_id := g.trainer_id;
  end if;
  return new;
end $$;
create trigger client_schedule_group before insert or update on public.client_schedule
  for each row execute function private.check_schedule_group();

-- Los grupos no pueden quedarse con más alumnos fijos que plazas
create or replace function private.check_group_capacity()
returns trigger language plpgsql set search_path = '' as $$
declare v_cap int; v_n int;
begin
  if new.group_id is null then return new; end if;
  select capacity into v_cap from public.class_groups where id = new.group_id;
  select count(*) into v_n from public.client_schedule where group_id = new.group_id;
  if v_n > v_cap then
    raise exception 'El grupo ya tiene sus % plazas ocupadas', v_cap using errcode = 'check_violation';
  end if;
  return new;
end $$;
create constraint trigger client_schedule_capacity after insert or update of group_id on public.client_schedule
  deferrable initially deferred
  for each row execute function private.check_group_capacity();

-- Al cancelar una sesión se apuntan fecha y autor; al reactivarla se borran
create or replace function private.booking_cancel_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'scheduled' and (tg_op = 'INSERT' or old.status = 'scheduled') then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, (select auth.uid()));
  elsif new.status = 'scheduled' then
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;
  return new;
end $$;
create trigger bookings_cancel_stamp before insert or update of status on public.bookings
  for each row execute function private.booking_cancel_stamp();

-- Pago marcado como cobrado: fecha por defecto hoy; al volver a pendiente se limpia
create or replace function private.payment_status_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, current_date);
    new.confirmed_by := coalesce(new.confirmed_by, private.my_staff_id());
  else
    new.paid_at := null;
    new.confirmed_by := null;
  end if;
  return new;
end $$;
create trigger payments_status_stamp before insert or update of status, paid_at on public.payments
  for each row execute function private.payment_status_stamp();

-- ---------- Registro de cambios ----------
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end,
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;
create trigger clients_audit         after insert or update or delete on public.clients         for each row execute function private.audit_row();
create trigger client_schedule_audit after insert or update or delete on public.client_schedule for each row execute function private.audit_row();
create trigger bookings_audit        after insert or update or delete on public.bookings        for each row execute function private.audit_row();
create trigger change_requests_audit after insert or update or delete on public.change_requests for each row execute function private.audit_row();
create trigger payments_audit        after insert or update or delete on public.payments        for each row execute function private.audit_row();
create trigger staff_audit           after insert or update or delete on public.staff           for each row execute function private.audit_row();
create trigger settings_audit        after update on public.settings                            for each row execute function private.audit_row();

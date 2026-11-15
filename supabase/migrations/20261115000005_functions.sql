-- NORDFIT · 5/7 · Reglas del negocio
-- Todo lo que tiene reglas pasa por estas funciones, para que no se puedan saltar desde el navegador:
--   available_slots, request_change, withdraw_request, decide_request, cancel_booking,
--   notify_payment, update_my_profile, month_usage, set_client_schedule,
--   add_absence, set_closure, generate_month_sessions, ensure_months.
-- Las operaciones que afectan a un día se serializan con un bloqueo por fecha para evitar
-- que dos personas reserven el mismo hueco a la vez.

-- ---------- Auxiliares de fecha y disponibilidad ----------
create or replace function private.tz()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.settings limit 1), 'Europe/Madrid')
$$;

create or replace function private.local_today()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone private.tz())::date
$$;

create or replace function private.slot_ts(p_date date, p_hour int)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select (p_date + make_time(p_hour, 0, 0)) at time zone private.tz()
$$;

create or replace function private.lock_day(p_date date)
returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtext('nordfit-day:' || p_date::text))
$$;

create or replace function private.is_closed(p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.studio_hours where weekday = extract(isodow from p_date))
      or exists (select 1 from public.closures where date = p_date)
$$;

create or replace function private.is_absent(p_staff uuid, p_date date, p_hour int)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_absences a
    where a.staff_id = p_staff and a.date = p_date
      and (a.all_day or (p_hour >= a.from_hour and p_hour < a.to_hour))
  )
$$;

-- Entrenador ocupado: tiene grupo, una sesión individual/pareja o una solicitud pendiente a esa hora
create or replace function private.trainer_busy(p_staff uuid, p_date date, p_hour int, p_except_request uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_groups g
                 where g.active and g.trainer_id = p_staff and g.weekday = extract(isodow from p_date) and g.start_hour = p_hour)
      or exists (select 1 from public.bookings b
                 where b.trainer_id = p_staff and b.date = p_date and b.start_hour = p_hour
                   and b.group_id is null and b.status = 'scheduled')
      or exists (select 1 from public.change_requests r
                 where r.status = 'pending' and r.to_trainer_id = p_staff and r.to_date = p_date and r.to_hour = p_hour
                   and r.to_group_id is null and r.id is distinct from p_except_request)
$$;

-- Plazas ocupadas de un grupo en una fecha (sesiones vigentes + solicitudes pendientes)
create or replace function private.group_taken(p_group uuid, p_date date, p_except_request uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.bookings b
          where b.group_id = p_group and b.date = p_date and b.status = 'scheduled')::int
       + (select count(*) from public.change_requests r
          where r.status = 'pending' and r.to_group_id = p_group and r.to_date = p_date
            and r.id is distinct from p_except_request)::int
$$;

-- Sesiones que cuentan para el bono de un mes
create or replace function private.month_used(p_client uuid, p_month date)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.bookings
  where client_id = p_client
    and date >= date_trunc('month', p_month)::date
    and date <  (date_trunc('month', p_month) + interval '1 month')::date
    and status in ('scheduled', 'late_cancelled')
$$;

-- ---------- Cliente ----------

-- Huecos de un día para el cliente con sesión iniciada.
-- 1:1 y pareja: horas del turno de su entrenador (o del indicado). Grupo: grupos de ese día.
create or replace function public.available_slots(p_date date, p_trainer uuid default null)
returns table (slot_date date, start_hour smallint, trainer_id uuid, group_id uuid,
               capacity smallint, free smallint, mine boolean, available boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_client public.clients;
  v_plan   public.plans;
  v_dow    int := extract(isodow from p_date);
  v_lead   interval;
  v_open   public.studio_hours;
  v_shift  public.staff_shifts;
  v_tid    uuid;
begin
  select * into v_client from public.clients where id = private.my_client_id();
  if not found then
    raise exception 'Solo disponible para clientes' using errcode = 'insufficient_privilege';
  end if;
  if private.is_closed(p_date) then return; end if;

  select * into v_plan from public.plans where code = v_client.plan_code;
  select make_interval(hours => min_change_hours) into v_lead from public.settings;
  select * into v_open from public.studio_hours where weekday = v_dow;

  if v_plan.is_group then
    return query
      select p_date, g.start_hour, g.trainer_id, g.id, g.capacity,
             (g.capacity - private.group_taken(g.id, p_date))::smallint,
             exists (select 1 from public.bookings b
                     where b.client_id = v_client.id and b.date = p_date and b.start_hour = g.start_hour and b.status = 'scheduled'),
             (private.slot_ts(p_date, g.start_hour) - now() >= v_lead
              and private.group_taken(g.id, p_date) < g.capacity
              and not exists (select 1 from public.bookings b
                              where b.client_id = v_client.id and b.date = p_date and b.start_hour = g.start_hour and b.status <> 'cancelled'))
      from public.class_groups g
      where g.active and g.weekday = v_dow and not private.is_absent(g.trainer_id, p_date, g.start_hour)
      order by g.start_hour;
    return;
  end if;

  v_tid := coalesce(p_trainer, v_client.trainer_id);
  select * into v_shift from public.staff_shifts s
    where s.staff_id = v_tid and s.weekday = v_dow
      and exists (select 1 from public.staff st where st.id = v_tid and st.active);
  if not found then return; end if;

  return query
    select p_date, h::smallint, v_tid, null::uuid, null::smallint, null::smallint,
           exists (select 1 from public.bookings b
                   where b.client_id = v_client.id and b.date = p_date and b.start_hour = h and b.status = 'scheduled'),
           (not private.is_absent(v_tid, p_date, h)
            and private.slot_ts(p_date, h) - now() >= v_lead
            and not private.trainer_busy(v_tid, p_date, h)
            and not exists (select 1 from public.bookings b
                            where b.client_id = v_client.id and b.date = p_date and b.start_hour = h and b.status <> 'cancelled'))
    from generate_series(greatest(v_shift.first_hour, v_open.first_hour), least(v_shift.last_hour, v_open.last_hour)) as h;
end $$;

-- Pedir un cambio de sesión (p_booking) o recuperar una sesión perdida (p_booking = null)
create or replace function public.request_change(p_booking uuid, p_date date, p_hour int,
                                                 p_trainer uuid default null, p_note text default '')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_client uuid := private.my_client_id();
  b        public.bookings;
  s        record;
  v_plan   public.plans;
  v_id     uuid;
begin
  if v_client is null then
    raise exception 'Solo disponible para clientes' using errcode = 'insufficient_privilege';
  end if;
  perform private.lock_day(p_date);

  if p_booking is not null then
    select * into b from public.bookings where id = p_booking and client_id = v_client for update;
    if not found then raise exception 'Sesión no encontrada'; end if;
    if b.status <> 'scheduled' or private.slot_ts(b.date, b.start_hour) <= now() then
      raise exception 'Esta sesión ya no se puede cambiar';
    end if;
    if exists (select 1 from public.change_requests where booking_id = p_booking and status = 'pending') then
      raise exception 'Ya tienes un cambio pendiente para esa sesión';
    end if;
  else
    select p.* into v_plan from public.plans p join public.clients c on c.plan_code = p.code where c.id = v_client;
    if private.month_used(v_client, p_date)
       + (select count(*) from public.change_requests r
          where r.client_id = v_client and r.booking_id is null and r.status = 'pending'
            and date_trunc('month', r.to_date) = date_trunc('month', p_date)) >= v_plan.sessions_per_month then
      raise exception 'Ya tienes todas las sesiones de ese mes';
    end if;
  end if;

  select * into s from public.available_slots(p_date, p_trainer) a where a.start_hour = p_hour limit 1;
  if not found or not s.available then
    raise exception 'Ese hueco ya no está libre. Elige otro.';
  end if;

  insert into public.change_requests (client_id, booking_id, from_date, from_hour, from_trainer_id,
                                      to_date, to_hour, to_trainer_id, to_group_id, approver_id, note)
  values (v_client, b.id, b.date, b.start_hour, b.trainer_id,
          p_date, p_hour, s.trainer_id, s.group_id, coalesce(b.trainer_id, s.trainer_id), coalesce(p_note, ''))
  returning id into v_id;
  return v_id;
end $$;

-- El cliente anula su solicitud pendiente
create or replace function public.withdraw_request(p_request uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.change_requests set status = 'withdrawn'
  where id = p_request and client_id = private.my_client_id() and status = 'pending';
  if not found then raise exception 'Esta solicitud ya no está pendiente'; end if;
end $$;

-- Cancelar una sesión.
-- Cliente: gratis hasta settings.cancel_hours antes; después cuenta como late_cancelled (se descuenta).
-- Dueño o entrenador de la sesión: siempre sin coste para el cliente.
-- En pareja se cancela la sesión de los dos.
create or replace function public.cancel_booking(p_booking uuid)
returns public.booking_status language plpgsql volatile security definer set search_path = '' as $$
declare
  b        public.bookings;
  v_client uuid := private.my_client_id();
  v_staff  uuid := private.my_staff_id();
  v_status public.booking_status;
  v_partner uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Sesión no encontrada'; end if;
  if b.status <> 'scheduled' then raise exception 'Esta sesión ya está cancelada'; end if;
  select partner_id into v_partner from public.clients where id = b.client_id;

  if private.is_owner() or (v_staff is not null and b.trainer_id = v_staff) then
    v_status := 'cancelled';
  elsif v_client is not null and (b.client_id = v_client or v_partner = v_client) then
    if private.slot_ts(b.date, b.start_hour) <= now() then
      raise exception 'Esta sesión ya ha pasado';
    end if;
    v_status := case
      when private.slot_ts(b.date, b.start_hour) - now() < (select make_interval(hours => cancel_hours) from public.settings)
      then 'late_cancelled'::public.booking_status else 'cancelled'::public.booking_status end;
  else
    raise exception 'No puedes cancelar esta sesión' using errcode = 'insufficient_privilege';
  end if;

  with upd as (
    update public.bookings set status = v_status
    where status = 'scheduled' and date = b.date and start_hour = b.start_hour
      and (id = b.id or (b.group_id is null and v_partner is not null and client_id = v_partner))
    returning id
  )
  update public.change_requests set status = 'withdrawn'
  where status = 'pending' and booking_id in (select id from upd);

  return v_status;
end $$;

-- «Ya he hecho el pago»: queda pendiente hasta que el dueño lo confirme
create or replace function public.notify_payment(p_month date, p_method public.payment_method)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_client uuid := private.my_client_id();
  v_month  date := date_trunc('month', p_month)::date;
  v_id     uuid;
begin
  if v_client is null then
    raise exception 'Solo disponible para clientes' using errcode = 'insufficient_privilege';
  end if;
  if v_month < date_trunc('month', private.local_today())::date - interval '2 months'
     or v_month > date_trunc('month', private.local_today())::date + interval '3 months' then
    raise exception 'Mes no válido';
  end if;
  insert into public.payments (client_id, month, amount, method, client_notified_at)
  select c.id, v_month, p.monthly_price, p_method, now()
  from public.clients c join public.plans p on p.code = c.plan_code where c.id = v_client
  on conflict (client_id, month) do update
    set method = excluded.method, client_notified_at = now()
    where public.payments.status = 'pending'
  returning id into v_id;
  if v_id is null then raise exception 'Ese mes ya está pagado'; end if;
  return v_id;
end $$;

-- El cliente actualiza su teléfono (el resto de datos los cambia el dueño)
create or replace function public.update_my_profile(p_phone text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.clients set phone = nullif(trim(p_phone), '') where id = private.my_client_id();
  if not found then raise exception 'Solo disponible para clientes' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Resumen del bono de un mes
create or replace function public.month_usage(p_client uuid default null, p_month date default null)
returns table (month date, sessions_total int, sessions_used int, sessions_left int,
               amount numeric, payment_status public.payment_status, client_notified boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_client uuid := coalesce(p_client, private.my_client_id());
  v_month  date := date_trunc('month', coalesce(p_month, private.local_today()))::date;
begin
  if v_client is null or not (
       v_client = private.my_client_id()
       or private.is_owner()
       or (private.is_staff() and private.trainer_sees_client(v_client))) then
    raise exception 'Sin acceso' using errcode = 'insufficient_privilege';
  end if;
  return query
    select v_month, p.sessions_per_month::int, private.month_used(c.id, v_month),
           greatest(0, p.sessions_per_month - private.month_used(c.id, v_month))::int,
           coalesce(pay.amount, p.monthly_price),
           coalesce(pay.status, 'pending'::public.payment_status),
           (pay.client_notified_at is not null and pay.status = 'pending')
    from public.clients c
    join public.plans p on p.code = c.plan_code
    left join public.payments pay on pay.client_id = c.id and pay.month = v_month
    where c.id = v_client;
end $$;

-- ---------- Equipo ----------

-- Aceptar o rechazar una solicitud (su entrenador o el dueño)
create or replace function public.decide_request(p_request uuid, p_accept boolean, p_note text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  r      public.change_requests;
  v_me   uuid := private.my_staff_id();
  v_cap  int;
  v_ids  uuid[];
begin
  if v_me is null then raise exception 'Solo para el equipo' using errcode = 'insufficient_privilege'; end if;
  select * into r from public.change_requests where id = p_request for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not private.is_owner() and r.approver_id <> v_me then
    raise exception 'Esta solicitud la decide otro entrenador' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'pending' then raise exception 'Esta solicitud ya no está pendiente'; end if;

  if p_accept then
    perform private.lock_day(r.to_date);
    if private.is_closed(r.to_date) or private.is_absent(r.to_trainer_id, r.to_date, r.to_hour) then
      raise exception 'El nuevo hueco ya no está libre. Rechaza la solicitud o habla con el cliente.';
    end if;
    if r.to_group_id is not null then
      select capacity into v_cap from public.class_groups where id = r.to_group_id;
      if private.group_taken(r.to_group_id, r.to_date, r.id) >= v_cap then
        raise exception 'El grupo ya está completo. Rechaza la solicitud o habla con el cliente.';
      end if;
    elsif private.trainer_busy(r.to_trainer_id, r.to_date, r.to_hour, r.id) then
      raise exception 'El nuevo hueco ya no está libre. Rechaza la solicitud o habla con el cliente.';
    end if;

    select array_remove(array[c.id, c.partner_id], null) into v_ids from public.clients c where c.id = r.client_id;

    if r.booking_id is not null then
      update public.bookings
        set date = r.to_date, start_hour = r.to_hour, trainer_id = r.to_trainer_id,
            group_id = r.to_group_id, moved = true
      where status = 'scheduled'
        and (id = r.booking_id
             or (r.to_group_id is null and client_id = any (v_ids) and date = r.from_date and start_hour = r.from_hour));
      if not found then raise exception 'La sesión original ya no existe o está cancelada'; end if;
    else
      insert into public.bookings (client_id, date, start_hour, trainer_id, plan_code, group_id, source, created_by)
      select c.id, r.to_date, r.to_hour, r.to_trainer_id, c.plan_code, r.to_group_id, 'request', (select auth.uid())
      from public.clients c
      where c.id = any (case when r.to_group_id is null then v_ids else array[r.client_id] end);
    end if;
  end if;

  update public.change_requests
    set status = case when p_accept then 'accepted'::public.request_status else 'rejected'::public.request_status end,
        decision_note = coalesce(p_note, ''), decided_by = v_me, decided_at = now()
  where id = p_request;
end $$;

-- Ausencia de un entrenador (él mismo o el dueño). Cancela sin coste las sesiones afectadas.
create or replace function public.add_absence(p_staff uuid, p_date date, p_all_day boolean,
                                              p_from int default null, p_to int default null,
                                              p_reason text default '', p_cancel_bookings boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := private.my_staff_id();
  v_id  uuid;
  v_n   int := 0;
begin
  if v_me is null or not (private.is_owner() or p_staff = v_me) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  perform private.lock_day(p_date);
  insert into public.staff_absences (staff_id, date, all_day, from_hour, to_hour, reason, created_by)
  values (p_staff, p_date, p_all_day,
          case when p_all_day then null else p_from end,
          case when p_all_day then null else p_to end,
          coalesce(p_reason, ''), v_me)
  returning id into v_id;

  if p_cancel_bookings then
    with upd as (
      update public.bookings set status = 'cancelled'
      where trainer_id = p_staff and date = p_date and status = 'scheduled'
        and (p_all_day or (start_hour >= p_from and start_hour < p_to))
      returning id
    ), rej as (
      update public.change_requests
        set status = 'rejected', decision_note = 'El entrenador no está ese día', decided_by = v_me, decided_at = now()
      where status = 'pending'
        and (booking_id in (select id from upd)
             or (to_trainer_id = p_staff and to_date = p_date and (p_all_day or (to_hour >= p_from and to_hour < p_to))))
      returning 1
    )
    select count(*) into v_n from upd;
  end if;
  return jsonb_build_object('id', v_id, 'cancelled', v_n);
end $$;

-- Cerrar el estudio un día (dueño). Cancela sin coste las sesiones de ese día.
create or replace function public.set_closure(p_date date, p_reason text default 'Cerrado', p_cancel_bookings boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := private.my_staff_id();
  v_n  int := 0;
begin
  if not private.is_owner() then raise exception 'Solo el dueño' using errcode = 'insufficient_privilege'; end if;
  perform private.lock_day(p_date);
  insert into public.closures (date, reason, created_by) values (p_date, coalesce(nullif(trim(p_reason), ''), 'Cerrado'), v_me)
  on conflict (date) do update set reason = excluded.reason;
  if p_cancel_bookings then
    with upd as (
      update public.bookings set status = 'cancelled' where date = p_date and status = 'scheduled' returning id
    ), rej as (
      update public.change_requests
        set status = 'rejected', decision_note = 'El estudio está cerrado ese día', decided_by = v_me, decided_at = now()
      where status = 'pending' and (to_date = p_date or booking_id in (select id from upd))
      returning 1
    )
    select count(*) into v_n from upd;
  end if;
  return jsonb_build_object('date', p_date, 'cancelled', v_n);
end $$;

-- Crea las sesiones de un mes a partir del horario fijo (hasta las del bono, nunca en el pasado).
-- No crea sesiones en días cerrados ni cuando el entrenador no está, ni repite huecos ya generados.
create or replace function public.generate_month_sessions(p_month date, p_client uuid default null, p_from date default null)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  c       record;
  d       date;
  sl      public.client_schedule;
  v_used  int;
  v_made  int := 0;
begin
  -- Desde el panel solo el dueño; sin sesión de usuario, las tareas programadas del servidor
  if (select auth.uid()) is not null and not private.is_owner() then
    raise exception 'Solo el dueño' using errcode = 'insufficient_privilege';
  end if;

  for c in
    select cl.id, cl.plan_code, cl.start_date, p.sessions_per_month
    from public.clients cl join public.plans p on p.code = cl.plan_code
    where cl.active and (p_client is null or cl.id = p_client)
      and exists (select 1 from public.client_schedule s where s.client_id = cl.id)
  loop
    v_used := private.month_used(c.id, v_month);
    for d in
      select gs::date from generate_series(
        greatest(v_month, c.start_date, coalesce(p_from, v_month), private.local_today()), v_end, interval '1 day') gs
    loop
      exit when v_used >= c.sessions_per_month;
      continue when private.is_closed(d);
      perform private.lock_day(d);
      for sl in
        select * from public.client_schedule
        where client_id = c.id and weekday = extract(isodow from d) order by start_hour
      loop
        exit when v_used >= c.sessions_per_month;
        continue when private.is_absent(sl.trainer_id, d, sl.start_hour);
        continue when exists (select 1 from public.bookings
                              where client_id = c.id and schedule_origin = d and schedule_origin_hour = sl.start_hour);
        continue when exists (select 1 from public.bookings
                              where client_id = c.id and date = d and start_hour = sl.start_hour and status <> 'cancelled');
        insert into public.bookings (client_id, date, start_hour, trainer_id, plan_code, group_id, source,
                                     schedule_origin, schedule_origin_hour)
        values (c.id, d, sl.start_hour, sl.trainer_id, c.plan_code, sl.group_id, 'schedule', d, sl.start_hour);
        v_used := v_used + 1;
        v_made := v_made + 1;
      end loop;
    end loop;
  end loop;
  return v_made;
end $$;

-- Mantenimiento diario: sesiones del mes actual y del siguiente, y cargos pendientes del mes actual
create or replace function public.ensure_months()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cur  date := date_trunc('month', private.local_today())::date;
  v_s    int;
  v_p    int;
begin
  if (select auth.uid()) is not null and not private.is_owner() then
    raise exception 'Solo el dueño' using errcode = 'insufficient_privilege';
  end if;
  v_s := public.generate_month_sessions(v_cur) + public.generate_month_sessions((v_cur + interval '1 month')::date);
  insert into public.payments (client_id, month, amount)
  select c.id, v_cur, p.monthly_price
  from public.clients c join public.plans p on p.code = c.plan_code
  where c.active and c.start_date < (v_cur + interval '1 month')::date
  on conflict (client_id, month) do nothing;
  get diagnostics v_p = row_count;
  return jsonb_build_object('sessions_created', v_s, 'payments_created', v_p);
end $$;

-- Cambiar el horario fijo de un cliente (dueño). Se aplica también a su pareja.
-- Rehace las sesiones futuras generadas por el horario (las movidas a mano se respetan).
-- p_slots: [{"weekday":1,"start_hour":9,"trainer_id":"…","group_id":null}, …]
create or replace function public.set_client_schedule(p_client uuid, p_slots jsonb)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids   uuid[];
  v_me    uuid := private.my_staff_id();
  v_today date := private.local_today();
  x       record;
  v_made  int := 0;
  v_id    uuid;
begin
  if not private.is_owner() then raise exception 'Solo el dueño' using errcode = 'insufficient_privilege'; end if;
  select array_remove(array[c.id, c.partner_id], null) into v_ids from public.clients c where c.id = p_client;
  if v_ids is null then raise exception 'Cliente no encontrado'; end if;

  for x in select * from jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb))
           as t(weekday int, start_hour int, trainer_id uuid, group_id uuid)
  loop
    if x.group_id is null and (
         exists (select 1 from public.client_schedule s
                 where s.trainer_id = x.trainer_id and s.weekday = x.weekday and s.start_hour = x.start_hour
                   and s.group_id is null and not (s.client_id = any (v_ids)))
         or exists (select 1 from public.class_groups g
                    where g.active and g.trainer_id = x.trainer_id and g.weekday = x.weekday and g.start_hour = x.start_hour)) then
      raise exception 'El hueco del día % a las %:00 ya lo tiene otro cliente o un grupo', x.weekday, x.start_hour;
    end if;
  end loop;

  delete from public.client_schedule where client_id = any (v_ids);
  insert into public.client_schedule (client_id, weekday, start_hour, trainer_id, group_id)
  select cid, t.weekday, t.start_hour, t.trainer_id, t.group_id
  from unnest(v_ids) as cid
  cross join jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb)) as t(weekday int, start_hour int, trainer_id uuid, group_id uuid);

  update public.change_requests
    set status = 'rejected', decision_note = 'Horario cambiado', decided_by = v_me, decided_at = now()
  where status = 'pending' and booking_id in (
    select id from public.bookings
    where client_id = any (v_ids) and source = 'schedule' and not moved and status = 'scheduled' and date > v_today);
  delete from public.bookings
  where client_id = any (v_ids) and source = 'schedule' and not moved and status = 'scheduled' and date > v_today;

  foreach v_id in array v_ids loop
    v_made := v_made
      + public.generate_month_sessions(v_today, v_id, v_today + 1)
      + public.generate_month_sessions((date_trunc('month', v_today) + interval '1 month')::date, v_id, v_today + 1);
  end loop;
  return v_made;
end $$;

-- ---------- Permisos de ejecución ----------
revoke all on all functions in schema private from public, anon;
grant execute on function private.my_staff_id(), private.is_owner(), private.is_staff(),
                          private.my_client_id(), private.trainer_sees_client(uuid) to authenticated;

revoke all on function public.available_slots(date, uuid), public.request_change(uuid, date, int, uuid, text),
  public.withdraw_request(uuid), public.cancel_booking(uuid), public.notify_payment(date, public.payment_method),
  public.update_my_profile(text), public.month_usage(uuid, date), public.decide_request(uuid, boolean, text),
  public.add_absence(uuid, date, boolean, int, int, text, boolean), public.set_closure(date, text, boolean),
  public.generate_month_sessions(date, uuid, date), public.ensure_months(), public.set_client_schedule(uuid, jsonb)
  from public, anon;
grant execute on function public.available_slots(date, uuid), public.request_change(uuid, date, int, uuid, text),
  public.withdraw_request(uuid), public.cancel_booking(uuid), public.notify_payment(date, public.payment_method),
  public.update_my_profile(text), public.month_usage(uuid, date), public.decide_request(uuid, boolean, text),
  public.add_absence(uuid, date, boolean, int, int, text, boolean), public.set_closure(date, text, boolean),
  public.generate_month_sessions(date, uuid, date), public.ensure_months(), public.set_client_schedule(uuid, jsonb)
  to authenticated;

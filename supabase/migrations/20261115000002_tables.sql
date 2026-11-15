-- NORDFIT · 2/7 · Tablas

-- Configuración general del estudio (una sola fila)
create table public.settings (
  id               boolean primary key default true check (id),
  studio_name      text not null default 'Nordfit',
  timezone         text not null default 'Europe/Madrid',
  session_minutes  smallint not null default 60 check (session_minutes between 15 and 240),
  cancel_hours     smallint not null default 24 check (cancel_hours between 0 and 168),
  min_change_hours smallint not null default 2 check (min_change_hours between 0 and 168),
  bank_holder      text,
  iban             text check (iban is null or replace(iban, ' ', '') ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bizum_phone      text,
  whatsapp_phone   text,
  contact_email    extensions.citext,
  updated_at       timestamptz not null default now()
);
comment on table public.settings is 'Configuración del estudio: reglas de cancelación y datos de pago que ve el cliente. Una sola fila.';
comment on column public.settings.cancel_hours is 'Horas mínimas de antelación para cancelar sin que la sesión se descuente';
comment on column public.settings.min_change_hours is 'Horas mínimas de antelación para pedir un cambio a un hueco';

-- Tipos de bono
create table public.plans (
  code               text primary key check (code ~ '^[a-z_]+$'),
  name               text not null,
  short_name         text not null,
  monthly_price      numeric(8,2) not null check (monthly_price >= 0),
  single_price       numeric(8,2) check (single_price >= 0),
  sessions_per_month smallint not null check (sessions_per_month > 0),
  is_group           boolean not null default false,
  sort_order         smallint not null default 0,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.plans is 'Bonos mensuales. Las sesiones no usadas no pasan al mes siguiente.';
comment on column public.plans.monthly_price is 'Precio del bono al mes por persona, IVA incluido';

-- Equipo: dueño y entrenadores
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  name       text not null check (length(trim(name)) > 0),
  email      extensions.citext unique,
  phone      text,
  role       public.staff_role not null default 'trainer',
  title      text not null default 'entrenador',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.staff is 'Equipo. owner ve y edita todo; trainer ve su agenda, sus clientes y sus solicitudes.';
comment on column public.staff.user_id is 'Cuenta de acceso. Se enlaza sola por email cuando la persona entra por primera vez.';

-- Horario de apertura (un día sin fila = cerrado)
create table public.studio_hours (
  weekday    smallint primary key check (weekday between 1 and 7),
  first_hour smallint not null check (first_hour between 0 and 23),
  last_hour  smallint not null check (last_hour between 0 and 23),
  check (first_hour <= last_hour)
);
comment on table public.studio_hours is 'Horas de inicio de la primera y la última sesión de cada día. Un día sin fila está cerrado.';

-- Turnos de cada entrenador
create table public.staff_shifts (
  staff_id   uuid not null references public.staff (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  first_hour smallint not null check (first_hour between 0 and 23),
  last_hour  smallint not null check (last_hour between 0 and 23),
  primary key (staff_id, weekday),
  check (first_hour <= last_hour)
);
comment on table public.staff_shifts is 'Turno semanal de cada entrenador: horas de inicio de su primera y última sesión.';

-- Grupos reducidos fijos
create table public.class_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  weekday    smallint not null check (weekday between 1 and 7),
  start_hour smallint not null check (start_hour between 0 and 23),
  trainer_id uuid not null references public.staff (id) on delete restrict,
  capacity   smallint not null default 4 check (capacity between 1 and 20),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, start_hour, trainer_id)
);
comment on table public.class_groups is 'Sesiones semanales fijas de grupo reducido, con su entrenador y plazas.';

-- Clientes
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users (id) on delete set null,
  full_name        text not null check (length(trim(full_name)) > 0),
  email            extensions.citext not null unique,
  phone            text,
  plan_code        text not null references public.plans (code) on update cascade,
  trainer_id       uuid references public.staff (id) on delete set null,
  partner_id       uuid references public.clients (id) on delete set null,
  preferred_method public.payment_method not null default 'transfer',
  start_date       date not null default current_date,
  active           boolean not null default true,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (partner_id is null or partner_id <> id),
  constraint clients_partner_unique unique (partner_id) deferrable initially deferred
);
comment on table public.clients is 'Clientes del estudio. Para dar de baja, active = false (se conserva el historial).';
comment on column public.clients.partner_id is 'Pareja con la que entrena (bono En pareja). Se mantiene simétrico automáticamente.';
comment on column public.clients.notes is 'Notas internas del equipo (lesiones, objetivos…). El cliente no las ve en su área.';

-- Horario fijo semanal de cada cliente
create table public.client_schedule (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  start_hour smallint not null check (start_hour between 0 and 23),
  trainer_id uuid not null references public.staff (id) on delete restrict,
  group_id   uuid references public.class_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, weekday, start_hour)
);
comment on table public.client_schedule is 'Horario fijo semanal. Las sesiones de cada mes se generan a partir de aquí.';

-- Días de cierre del estudio
create table public.closures (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  reason     text not null default 'Cerrado',
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.closures is 'Días en los que el estudio está cerrado (festivos, vacaciones).';

-- Ausencias de entrenadores (día entero o franja)
create table public.staff_absences (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff (id) on delete cascade,
  date       date not null,
  all_day    boolean not null default true,
  from_hour  smallint,
  to_hour    smallint,
  reason     text not null default '',
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (all_day and from_hour is null and to_hour is null)
    or (not all_day and from_hour between 0 and 23 and to_hour between 1 and 24 and from_hour < to_hour)
  )
);
comment on table public.staff_absences is 'Días u horas en los que un entrenador no está. Franja [from_hour, to_hour).';
create index staff_absences_staff_date on public.staff_absences (staff_id, date);
create index staff_absences_date on public.staff_absences (date);

-- Sesiones (una fila por cliente y sesión; una pareja tiene dos filas a la misma hora)
create table public.bookings (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete cascade,
  date                 date not null,
  start_hour           smallint not null check (start_hour between 0 and 23),
  trainer_id           uuid not null references public.staff (id) on delete restrict,
  plan_code            text not null references public.plans (code) on update cascade,
  group_id             uuid references public.class_groups (id) on delete set null,
  status               public.booking_status not null default 'scheduled',
  source               public.booking_source not null default 'schedule',
  schedule_origin      date,
  schedule_origin_hour smallint,
  moved                boolean not null default false,
  cancelled_at         timestamptz,
  cancelled_by         uuid references auth.users (id) on delete set null,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((schedule_origin is null) = (schedule_origin_hour is null)),
  check ((status = 'scheduled') = (cancelled_at is null))
);
comment on table public.bookings is 'Sesiones de cada cliente. Cuentan para el bono las scheduled y las late_cancelled.';
comment on column public.bookings.schedule_origin is 'Fecha del horario fijo de la que salió la sesión. Evita volver a crearla si se mueve o se cancela.';
-- Un cliente no puede tener dos sesiones vigentes a la misma hora
create unique index bookings_client_slot on public.bookings (client_id, date, start_hour) where status <> 'cancelled';
-- Cada hueco del horario fijo genera como mucho una sesión
create unique index bookings_schedule_origin on public.bookings (client_id, schedule_origin, schedule_origin_hour) where schedule_origin is not null;
create index bookings_trainer_date on public.bookings (trainer_id, date);
create index bookings_date on public.bookings (date);
create index bookings_group_date on public.bookings (group_id, date) where group_id is not null;

-- Solicitudes de cambio de sesión (o de recuperación de una sesión perdida)
create table public.change_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  booking_id      uuid references public.bookings (id) on delete set null,
  from_date       date,
  from_hour       smallint check (from_hour between 0 and 23),
  from_trainer_id uuid references public.staff (id) on delete set null,
  to_date         date not null,
  to_hour         smallint not null check (to_hour between 0 and 23),
  to_trainer_id   uuid not null references public.staff (id) on delete restrict,
  to_group_id     uuid references public.class_groups (id) on delete set null,
  approver_id     uuid not null references public.staff (id) on delete restrict,
  status          public.request_status not null default 'pending',
  note            text not null default '',
  decision_note   text not null default '',
  decided_by      uuid references public.staff (id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status in ('pending', 'withdrawn')) = (decided_at is null))
);
comment on table public.change_requests is 'El cliente pide mover una sesión (o recuperar una perdida, sin booking_id). La decide su entrenador o el dueño.';
create unique index change_requests_one_pending on public.change_requests (booking_id) where status = 'pending' and booking_id is not null;
create index change_requests_approver_pending on public.change_requests (approver_id) where status = 'pending';
create index change_requests_client on public.change_requests (client_id);
create index change_requests_slot_pending on public.change_requests (to_date, to_hour) where status = 'pending';

-- Pagos del bono (uno por cliente y mes)
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete restrict,
  month              date not null check (extract(day from month) = 1),
  amount             numeric(8,2) not null check (amount >= 0),
  status             public.payment_status not null default 'pending',
  method             public.payment_method,
  client_notified_at timestamptz,
  paid_at            date,
  confirmed_by       uuid references public.staff (id) on delete set null,
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, month),
  check ((status = 'paid') = (paid_at is not null))
);
comment on table public.payments is 'Bono de cada cliente y mes. El cliente avisa (client_notified_at) y el dueño confirma (status = paid).';
comment on column public.payments.client_notified_at is 'Cuándo dijo el cliente «Ya he hecho el pago». Sigue pendiente hasta que el dueño lo confirme.';
create index payments_month_status on public.payments (month, status);

-- Recordatorios de pago enviados
create table public.payment_reminders (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month     date not null check (extract(day from month) = 1),
  sent_at   timestamptz not null default now(),
  sent_by   uuid references public.staff (id) on delete set null
);
create index payment_reminders_client_month on public.payment_reminders (client_id, month);

-- Registro de cambios (quién cambió qué y cuándo)
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  table_name text not null,
  row_id     text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb
);
comment on table public.audit_log is 'Historial de cambios en clientes, horarios, sesiones, solicitudes y pagos. Solo lectura para el dueño.';
create index audit_log_row on public.audit_log (table_name, row_id);
create index audit_log_at on public.audit_log (at desc);

-- updated_at automático
create trigger settings_updated_at        before update on public.settings        for each row execute function private.set_updated_at();
create trigger plans_updated_at           before update on public.plans           for each row execute function private.set_updated_at();
create trigger staff_updated_at           before update on public.staff           for each row execute function private.set_updated_at();
create trigger class_groups_updated_at    before update on public.class_groups    for each row execute function private.set_updated_at();
create trigger clients_updated_at         before update on public.clients         for each row execute function private.set_updated_at();
create trigger bookings_updated_at        before update on public.bookings        for each row execute function private.set_updated_at();
create trigger change_requests_updated_at before update on public.change_requests for each row execute function private.set_updated_at();
create trigger payments_updated_at        before update on public.payments        for each row execute function private.set_updated_at();

-- Índices de claves foráneas
create index clients_trainer on public.clients (trainer_id);
create index clients_plan on public.clients (plan_code);
create index client_schedule_trainer on public.client_schedule (trainer_id, weekday, start_hour);
create index client_schedule_group on public.client_schedule (group_id) where group_id is not null;
create index class_groups_trainer on public.class_groups (trainer_id);
create index bookings_plan on public.bookings (plan_code);
create index change_requests_booking on public.change_requests (booking_id) where booking_id is not null;

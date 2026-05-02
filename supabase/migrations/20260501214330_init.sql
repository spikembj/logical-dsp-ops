-- =============================================================================
-- Initial schema: DSP Operations App (Phase 1 — performance & coaching)
-- =============================================================================
-- Built from SPEC.md §Data Model. Establishes:
--   * Enums for roles, statuses, tiers, severities, import types
--   * Tables: users, drivers, file_imports, scorecards, safety_events,
--             coaching_sessions, coaching_session_revisions
--   * Indexes for the hot lookups (driver by transporter_id, scorecard by
--             driver+week, events by driver+date, sessions by driver+date)
--   * Triggers:
--       - set_updated_at on tables that track it
--       - log_coaching_session_revision: every UPDATE on coaching_sessions
--         pushes the prior row into coaching_session_revisions, enforcing
--         the audit rule at the database level
--   * Row-Level Security on every table
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'manager', 'dispatcher');
create type public.driver_status as enum ('active', 'loa', 'terminated');
create type public.vehicle_type as enum ('cdv', 'edv', 'step_van', 'rivian');
create type public.tier as enum ('fantastic_plus', 'fantastic', 'great', 'fair', 'poor');
create type public.severity as enum ('impacting', 'non_impacting');
create type public.import_type as enum ('scorecard', 'netradyne');

-- -----------------------------------------------------------------------------
-- Helper: set_updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- users — internal team members. id mirrors auth.users.id 1:1.
-- -----------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        public.user_role not null default 'dispatcher',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.users is
  'Internal team members. Role-gated access. Inactive users cannot sign in.';

-- -----------------------------------------------------------------------------
-- current_user_role() — reads the caller's role for use in RLS policies.
-- security definer so RLS on users itself doesn't recurse.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid() and active = true;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.users where id = auth.uid() and active = true);
$$;

-- -----------------------------------------------------------------------------
-- drivers
-- -----------------------------------------------------------------------------
create table public.drivers (
  id                       uuid primary key default gen_random_uuid(),
  transporter_id           text not null unique,
  full_name                text not null,
  hire_date                date,
  status                   public.driver_status not null default 'active',
  approved_vehicle_types   public.vehicle_type[] not null default '{}',
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index drivers_status_idx on public.drivers(status);
create index drivers_full_name_idx on public.drivers(full_name);

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

comment on table public.drivers is
  'DSP drivers. Soft-delete only via status=terminated. Vehicle assignment is NOT here — it lives in the future fleet module.';

-- -----------------------------------------------------------------------------
-- file_imports — audit row for every uploaded scorecard PDF / Netradyne CSV.
-- (Spec called this csv_imports; renamed because scorecards are PDFs.)
-- -----------------------------------------------------------------------------
create table public.file_imports (
  id             uuid primary key default gen_random_uuid(),
  uploaded_by    uuid not null references public.users(id),
  import_type    public.import_type not null,
  file_name      text not null,
  file_hash      text,                       -- sha256 of file bytes; used to detect re-imports
  row_count      integer not null default 0,
  success_count  integer not null default 0,
  error_count    integer not null default 0,
  errors         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index file_imports_type_idx on public.file_imports(import_type, created_at desc);
create index file_imports_hash_idx on public.file_imports(file_hash) where file_hash is not null;

-- -----------------------------------------------------------------------------
-- scorecards — weekly performance snapshot per driver.
-- -----------------------------------------------------------------------------
create table public.scorecards (
  id                          uuid primary key default gen_random_uuid(),
  driver_id                   uuid not null references public.drivers(id) on delete restrict,
  week_ending                 date not null,
  tier                        public.tier,
  fico_score                  integer,
  dcr                         numeric(6, 3),
  delivery_completion_rate    numeric(6, 3),
  cdf                         numeric(6, 3),
  seatbelt_off_rate           numeric(6, 3),
  speeding_event_rate         numeric(6, 3),
  distractions_rate           numeric(6, 3),
  following_distance_rate     numeric(6, 3),
  sign_signal_violations_rate numeric(6, 3),
  raw_data                    jsonb,
  imported_from               uuid references public.file_imports(id),
  created_at                  timestamptz not null default now(),
  unique (driver_id, week_ending)
);

create index scorecards_driver_week_idx on public.scorecards(driver_id, week_ending desc);
create index scorecards_week_idx on public.scorecards(week_ending desc);

comment on column public.scorecards.raw_data is
  'Full row from the source PDF/CSV. Cortex columns shift over time — this is the safety net.';

-- -----------------------------------------------------------------------------
-- safety_events — individual Netradyne (or other) events per driver.
-- -----------------------------------------------------------------------------
create table public.safety_events (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers(id) on delete restrict,
  event_date     timestamptz not null,
  event_type     text not null,
  severity       public.severity not null,    -- derived on import per SPEC.md classification
  count          integer not null default 1,
  source         text not null default 'netradyne',
  raw_data       jsonb,
  imported_from  uuid references public.file_imports(id),
  notes          text,
  created_at     timestamptz not null default now()
);

create index safety_events_driver_date_idx on public.safety_events(driver_id, event_date desc);
create index safety_events_severity_idx on public.safety_events(severity, event_date desc);

comment on column public.safety_events.severity is
  'Impacting: Sign Violations, Traffic Light, Speeding, Distraction, Seatbelt, Camera Obstruction, Following Distance, Roadside Parking. Non-impacting: High-G, Hard Braking, Hard Turn, Hard Acceleration, Drowsiness, Weaving, Backing.';

-- -----------------------------------------------------------------------------
-- coaching_sessions — immutable. Edits go through the revisions table.
-- -----------------------------------------------------------------------------
create table public.coaching_sessions (
  id                   uuid primary key default gen_random_uuid(),
  driver_id            uuid not null references public.drivers(id) on delete restrict,
  coached_by           uuid not null references public.users(id),
  session_date         date not null,
  topic                text not null,
  notes                text,
  acknowledged         boolean not null default false,
  acknowledged_at      timestamptz,
  linked_scorecard_id  uuid references public.scorecards(id) on delete set null,
  linked_event_ids     uuid[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index coaching_sessions_driver_date_idx
  on public.coaching_sessions(driver_id, session_date desc);
create index coaching_sessions_coached_by_idx
  on public.coaching_sessions(coached_by, created_at desc);

create trigger coaching_sessions_set_updated_at
  before update on public.coaching_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- coaching_session_revisions — append-only audit trail of edits.
-- -----------------------------------------------------------------------------
create table public.coaching_session_revisions (
  id                  uuid primary key default gen_random_uuid(),
  coaching_session_id uuid not null references public.coaching_sessions(id) on delete cascade,
  edited_by           uuid references public.users(id),
  edited_at           timestamptz not null default now(),
  previous_values     jsonb not null
);

create index coaching_session_revisions_session_idx
  on public.coaching_session_revisions(coaching_session_id, edited_at desc);

-- -----------------------------------------------------------------------------
-- Trigger: on UPDATE of coaching_sessions, snapshot the OLD row into revisions.
-- This enforces the audit rule at the DB level — even a service-role client
-- can't mutate without a revision being recorded.
-- -----------------------------------------------------------------------------
create or replace function public.log_coaching_session_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coaching_session_revisions (coaching_session_id, edited_by, previous_values)
  values (
    old.id,
    auth.uid(),
    to_jsonb(old)
  );
  return new;
end;
$$;

create trigger coaching_sessions_log_revision
  after update on public.coaching_sessions
  for each row execute function public.log_coaching_session_revision();

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Pattern: every table has RLS on. Policies:
--   * Read: any active user (is_active_user())
--   * Write: gated by current_user_role() per table
-- The application layer (lib/auth/require-role.ts + middleware) is the UX gate;
-- these policies are the safety net.
-- =============================================================================

alter table public.users enable row level security;
alter table public.drivers enable row level security;
alter table public.file_imports enable row level security;
alter table public.scorecards enable row level security;
alter table public.safety_events enable row level security;
alter table public.coaching_sessions enable row level security;
alter table public.coaching_session_revisions enable row level security;

-- ---- users ------------------------------------------------------------------
-- A signed-in user can always read their own row (needed for current_user_role
-- to bootstrap and for "show me my role" UI).
create policy users_select_self on public.users
  for select using (id = auth.uid());

-- Active users can read all teammates (needed for "coached_by" displays).
create policy users_select_active on public.users
  for select using (public.is_active_user());

-- Only admins can insert/update/delete users.
create policy users_admin_write on public.users
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---- drivers ----------------------------------------------------------------
create policy drivers_select on public.drivers
  for select using (public.is_active_user());

create policy drivers_write on public.drivers
  for all
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

-- ---- file_imports -----------------------------------------------------------
create policy file_imports_select on public.file_imports
  for select using (public.is_active_user());

-- Any active user can insert (their own) imports; updates/deletes blocked.
create policy file_imports_insert on public.file_imports
  for insert
  with check (public.is_active_user() and uploaded_by = auth.uid());

-- ---- scorecards -------------------------------------------------------------
create policy scorecards_select on public.scorecards
  for select using (public.is_active_user());

-- Insert via import flow (admin/manager). No updates or deletes — historical.
create policy scorecards_insert on public.scorecards
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

-- ---- safety_events ----------------------------------------------------------
create policy safety_events_select on public.safety_events
  for select using (public.is_active_user());

create policy safety_events_insert on public.safety_events
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

-- ---- coaching_sessions ------------------------------------------------------
create policy coaching_sessions_select on public.coaching_sessions
  for select using (public.is_active_user());

-- Any active user can log a session; coached_by must be themselves.
create policy coaching_sessions_insert on public.coaching_sessions
  for insert
  with check (public.is_active_user() and coached_by = auth.uid());

-- Edits: original author or any admin. Trigger logs the previous values.
-- Note we deliberately allow the acknowledged toggle from anyone with edit
-- rights — the revision row will record who flipped it and when.
create policy coaching_sessions_update on public.coaching_sessions
  for update
  using (
    coached_by = auth.uid()
    or public.current_user_role() = 'admin'
  )
  with check (
    coached_by = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- No deletes from clients. (Admins can soft-delete by adding a status column
-- in a future migration if needed; for now, sessions are permanent.)

-- ---- coaching_session_revisions ---------------------------------------------
-- Read-only from clients. Trigger writes; nothing else.
create policy coaching_session_revisions_select on public.coaching_session_revisions
  for select using (public.is_active_user());
-- Intentionally NO insert/update/delete policy — RLS denies by default,
-- and the trigger uses security definer to bypass RLS on insert.

-- =============================================================================
-- Done.
-- After running this, the first signed-up user will have NO row in public.users
-- (auth.users only). Run the bootstrap snippet in supabase/seed.sql to create
-- the first admin row.
-- =============================================================================

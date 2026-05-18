-- =============================================================================
-- Daily Ops — Phase A: wave_times + daily_roster
--
-- This is the foundation for the dispatcher daily workflow. Replaces the
-- "DUT7 Dispatch Sheet" Google Sheet they edit every morning.
--
-- Two tables:
--
--   `wave_times` — small editable lookup of Amazon wave numbers → show
--   times. Seeded with the 8 current waves (1=9:50 … 8=10:30); Amazon
--   reshuffles maybe twice a year, so we let management edit via the
--   /admin/waves page rather than ship code each time.
--
--   `daily_roster` — one row per (driver, vehicle, date) assignment. The
--   primary key is the row id; uniqueness on (date, driver_id) and
--   (date, vehicle_id) prevents double-booking. Rows persist as the
--   historical record — useful when damage is found and we need to look
--   up who drove a van on a given day.
--
-- Permission model:
--   * Read: every active user.
--   * Write: dispatchers AND management (new is_operations() helper).
--     This is the dispatchers' main workspace, so they need write access
--     here even though they're read-only everywhere else.
--   * wave_times edits stay management-only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: is_operations() — dispatcher OR management.
-- -----------------------------------------------------------------------------
drop function if exists public.is_operations();
create function public.is_operations()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role()
    in ('owner', 'hr', 'ops_manager', 'admin', 'manager', 'dispatcher');
$$;
grant execute on function public.is_operations() to authenticated;

comment on function public.is_operations() is
  'True for any active operations user (management OR dispatcher). Used by daily_roster RLS so dispatchers can write to their own workspace.';

-- -----------------------------------------------------------------------------
-- wave_times — editable lookup of Amazon wave number → show time.
-- -----------------------------------------------------------------------------
create table public.wave_times (
  wave int primary key check (wave between 1 and 20),
  show_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wave_times_set_updated_at
  before update on public.wave_times
  for each row execute function public.set_updated_at();

-- Seed the 8 current waves. Per the user: wave 1-4 are +5 min apart,
-- wave 4→5 is +10 min (Amazon's choice), then +5 again through wave 8.
insert into public.wave_times (wave, show_time) values
  (1, '09:50'),
  (2, '09:55'),
  (3, '10:00'),
  (4, '10:05'),
  (5, '10:15'),
  (6, '10:20'),
  (7, '10:25'),
  (8, '10:30');

alter table public.wave_times enable row level security;
create policy wave_times_select on public.wave_times
  for select using (public.is_active_user());
create policy wave_times_write on public.wave_times
  for all using (public.is_management()) with check (public.is_management());

grant select on public.wave_times to authenticated;
grant insert, update, delete on public.wave_times to authenticated;

-- -----------------------------------------------------------------------------
-- daily_roster — one row per (date, driver) assignment.
-- -----------------------------------------------------------------------------
create table public.daily_roster (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  wave int not null references public.wave_times(wave) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  unique (date, driver_id),
  unique (date, vehicle_id)
);

create index daily_roster_date_idx on public.daily_roster (date desc);
create index daily_roster_vehicle_idx on public.daily_roster (vehicle_id, date desc);
create index daily_roster_driver_idx on public.daily_roster (driver_id, date desc);

create trigger daily_roster_set_updated_at
  before update on public.daily_roster
  for each row execute function public.set_updated_at();

comment on table public.daily_roster is
  'Per-day driver-to-vehicle assignment. Permanent record — when damage is later found on a van, query by (vehicle_id, date) to find who drove it that day.';
comment on column public.daily_roster.wave is
  'Amazon wave number — joins to wave_times for the show time.';

alter table public.daily_roster enable row level security;

create policy daily_roster_select on public.daily_roster
  for select using (public.is_active_user());
create policy daily_roster_write on public.daily_roster
  for all using (public.is_operations()) with check (public.is_operations());

grant select on public.daily_roster to authenticated;
grant insert, update, delete on public.daily_roster to authenticated;

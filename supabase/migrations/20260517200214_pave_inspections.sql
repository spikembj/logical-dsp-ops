-- =============================================================================
-- Quarterly PAVE (Periodic Amazon Vehicle Evaluation) tracking.
--
-- Amazon mandates a PAVE inspection on every van once per calendar quarter.
-- Each inspection produces a score 1-4; 3 or 4 is acceptable, 1 or 2 means
-- the van needs to be re-inspected before the quarter ends. Failure doesn't
-- ground the van — it's purely an administrative compliance concern.
--
-- Schema notes:
--   * One row per inspection (not per-quarter). A van can have multiple
--     inspections in a single quarter (e.g. score=2 in April triggers a
--     re-inspection in May with score=4). The latest row wins for status.
--   * `quarter` + `year` are denormalized from `completed_date` so the
--     "this quarter status" query is a simple equality lookup instead of
--     a date-range scan. Kept in sync via a trigger so they can't drift.
-- =============================================================================

create table public.vehicle_pave_inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  completed_date date not null,
  quarter int not null check (quarter between 1 and 4),
  year int not null check (year between 2020 and 2100),
  score int not null check (score between 1 and 4),
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index vehicle_pave_inspections_vehicle_idx
  on public.vehicle_pave_inspections (vehicle_id, year desc, quarter desc, completed_date desc);

create index vehicle_pave_inspections_quarter_idx
  on public.vehicle_pave_inspections (year, quarter, vehicle_id);

comment on column public.vehicle_pave_inspections.score is
  '1-4 score from the PAVE inspection. 3-4 = acceptable, 1-2 = re-inspect required this quarter.';
comment on column public.vehicle_pave_inspections.quarter is
  'Calendar quarter (1=Jan-Mar, 2=Apr-Jun, 3=Jul-Sep, 4=Oct-Dec). Derived from completed_date via the sync trigger.';

-- Keep (quarter, year) in sync with completed_date — no chance of the
-- denormalized fields drifting.
create function public.sync_pave_quarter_from_date()
returns trigger
language plpgsql
as $$
begin
  new.quarter := ((extract(month from new.completed_date)::int - 1) / 3) + 1;
  new.year := extract(year from new.completed_date)::int;
  return new;
end;
$$;

create trigger vehicle_pave_inspections_sync_quarter
  before insert or update of completed_date
  on public.vehicle_pave_inspections
  for each row execute function public.sync_pave_quarter_from_date();

-- -----------------------------------------------------------------------------
-- RLS — same pattern as vehicles/vehicle_issues: read for active users,
-- write for management.
-- -----------------------------------------------------------------------------
alter table public.vehicle_pave_inspections enable row level security;

create policy vehicle_pave_inspections_select on public.vehicle_pave_inspections
  for select using (public.is_active_user());
create policy vehicle_pave_inspections_write on public.vehicle_pave_inspections
  for all using (public.is_management()) with check (public.is_management());

grant select on public.vehicle_pave_inspections to authenticated;
grant insert, update, delete on public.vehicle_pave_inspections to authenticated;

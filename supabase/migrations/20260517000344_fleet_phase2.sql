-- =============================================================================
-- Phase 2 — Fleet
--
-- Adds the three Fleet tables (`vehicles`, `vehicle_issues`, `vehicle_parts`),
-- extends `import_type` with `vehicles`, and ships the grounding
-- auto-issue helper that fires when the Vehicles import flips a van's
-- operational status.
--
-- Schema rationale lives in SPEC.md's Data Model section. Two specifics
-- worth flagging here:
--
-- 1. `vehicles.operational_status_source` distinguishes Amazon-imported
--    status from a manual override. The import preserves manual rows; the
--    override clears via the van detail page's "Use Amazon's value"
--    button (sets source back to 'amazon' and re-applies whatever Amazon
--    last said).
--
-- 2. Grounding auto-issues are tagged `auto_created = true` so the
--    auto-close pass can find them when Amazon flips the van back to
--    operational. Manual issues with the same van are never auto-closed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extend import_type enum
-- -----------------------------------------------------------------------------
alter type public.import_type add value if not exists 'vehicles';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.vehicle_operational_status as enum (
  'operational',
  'grounded',
  'ready_for_audit'
);

create type public.vehicle_status_source as enum ('amazon', 'manual');

create type public.vehicle_ownership_type as enum (
  'amazon_owned',
  'amazon_rental',
  'amazon_leased'
);

create type public.vehicle_issue_category as enum (
  'damage',
  'mechanical',
  'electrical',
  'cosmetic',
  'tires',
  'other'
);

create type public.vehicle_issue_severity as enum (
  'minor',
  'moderate',
  'major',
  'out_of_service'
);

create type public.vehicle_issue_status as enum (
  'open',
  'in_shop',
  'fixed',
  'closed_no_repair'
);

create type public.vehicle_part_status as enum (
  'needed',
  'ordered',
  'partial',
  'received',
  'installed',
  'returned'
);

-- -----------------------------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vin text not null unique,

  -- Amazon-managed identity
  vehicle_name text,
  license_plate text,
  make text,
  model text,
  sub_model text,
  year int,
  service_type text,
  service_tier text,
  ownership_type public.vehicle_ownership_type,
  vehicle_provider text,
  registration_expiry_date date,
  registered_state text,
  station_code text,

  -- Operational status (override-aware)
  operational_status public.vehicle_operational_status not null default 'operational',
  operational_status_source public.vehicle_status_source not null default 'amazon',
  operational_status_changed_at timestamptz not null default now(),
  operational_status_changed_by uuid references public.users(id) on delete set null,
  status_reason_message text,
  manual_status_note text,

  -- Locally-managed
  current_shop_location text,
  eod_parking_location text,
  notes text,

  -- Audit / import
  raw_data jsonb,
  imported_from uuid references public.file_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicles_status_idx on public.vehicles(operational_status);
create index vehicles_registration_expiry_idx on public.vehicles(registration_expiry_date);
create index vehicles_shop_idx on public.vehicles(current_shop_location)
  where current_shop_location is not null;

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

comment on column public.vehicles.operational_status_source is
  'amazon = field is owned by the latest import (default). manual = user has overridden; the import preserves the manual value but updates raw_data so the UI can prompt to clear the override.';
comment on column public.vehicles.raw_data is
  'Full Amazon row as imported, including any columns we don''t map to typed fields. Future-proofs against Amazon adding columns.';

-- -----------------------------------------------------------------------------
-- vehicle_issues
-- -----------------------------------------------------------------------------
create table public.vehicle_issues (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  reported_at timestamptz not null default now(),
  reported_by uuid references public.users(id) on delete set null,

  category public.vehicle_issue_category not null default 'other',
  severity public.vehicle_issue_severity not null default 'minor',
  description text not null,
  status public.vehicle_issue_status not null default 'open',

  resolved_at timestamptz,
  resolution_notes text,

  auto_created boolean not null default false,
  photo_urls jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_issues_vehicle_idx on public.vehicle_issues(vehicle_id, status);
create index vehicle_issues_open_idx on public.vehicle_issues(vehicle_id)
  where status in ('open', 'in_shop');

create trigger vehicle_issues_set_updated_at
  before update on public.vehicle_issues
  for each row execute function public.set_updated_at();

comment on column public.vehicle_issues.auto_created is
  'True when the row was created by apply_vehicle_grounding_changes() in response to an Amazon-status flip. Auto-rows auto-close when Amazon flips the van back to operational; manual rows are never auto-closed.';
comment on column public.vehicle_issues.photo_urls is
  'Empty in Phase 2. Populated in Phase 3 when driver-facing VCR + photo damage detection ship.';

-- -----------------------------------------------------------------------------
-- vehicle_parts
-- -----------------------------------------------------------------------------
create table public.vehicle_parts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  issue_id uuid references public.vehicle_issues(id) on delete set null,

  part_name text not null,
  part_number text,

  quantity_ordered int not null default 0 check (quantity_ordered >= 0),
  quantity_received int not null default 0 check (quantity_received >= 0),
  quantity_installed int not null default 0 check (quantity_installed >= 0),

  status public.vehicle_part_status not null default 'needed',

  vendor text,
  cost numeric(10, 2),

  ordered_at timestamptz,
  received_at timestamptz,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_parts_received_le_ordered
    check (quantity_received <= quantity_ordered),
  constraint vehicle_parts_installed_le_received
    check (quantity_installed <= quantity_received)
);

create index vehicle_parts_vehicle_idx on public.vehicle_parts(vehicle_id, status);
create index vehicle_parts_issue_idx on public.vehicle_parts(issue_id)
  where issue_id is not null;
create index vehicle_parts_open_idx on public.vehicle_parts(vehicle_id)
  where status in ('needed', 'ordered', 'partial');

create trigger vehicle_parts_set_updated_at
  before update on public.vehicle_parts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Read: any active authenticated user (same pattern as drivers/scorecards).
-- Write: management only via is_management().
-- -----------------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.vehicle_issues enable row level security;
alter table public.vehicle_parts enable row level security;

create policy vehicles_select on public.vehicles
  for select using (public.is_active_user());
create policy vehicles_write on public.vehicles
  for all using (public.is_management()) with check (public.is_management());

create policy vehicle_issues_select on public.vehicle_issues
  for select using (public.is_active_user());
create policy vehicle_issues_write on public.vehicle_issues
  for all using (public.is_management()) with check (public.is_management());

create policy vehicle_parts_select on public.vehicle_parts
  for select using (public.is_active_user());
create policy vehicle_parts_write on public.vehicle_parts
  for all using (public.is_management()) with check (public.is_management());

grant select on public.vehicles to authenticated;
grant select on public.vehicle_issues to authenticated;
grant select on public.vehicle_parts to authenticated;
grant insert, update, delete on public.vehicles to authenticated;
grant insert, update, delete on public.vehicle_issues to authenticated;
grant insert, update, delete on public.vehicle_parts to authenticated;

-- -----------------------------------------------------------------------------
-- apply_vehicle_grounding_changes()
--
-- Called by the vehicles-import server action after the upsert completes,
-- with the list of VINs that were just touched. For each:
--
--   * If Amazon-managed status flipped operational -> grounded/ready_for_audit
--     AND there's no existing open auto-issue, insert one tagged auto_created.
--
--   * If status flipped back to operational, mark any open auto-issue as
--     fixed (resolved_at=now, resolution_notes notes Amazon clearance).
--
-- Manual-source rows are skipped entirely — the user is driving the state
-- and doesn't want side effects.
--
-- Returns (grounded_count, ungrounded_count) for the import result card.
-- -----------------------------------------------------------------------------
create function public.apply_vehicle_grounding_changes(
  affected_vehicle_ids uuid[]
) returns table(grounded_count int, ungrounded_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  g int := 0;
  u int := 0;
  v record;
begin
  for v in
    select id, operational_status, operational_status_source, status_reason_message, vehicle_name, vin
    from public.vehicles
    where id = any(affected_vehicle_ids)
      and operational_status_source = 'amazon'
  loop
    if v.operational_status in ('grounded', 'ready_for_audit') then
      -- Create an auto-issue if none open
      if not exists (
        select 1 from public.vehicle_issues
        where vehicle_id = v.id
          and auto_created = true
          and status in ('open', 'in_shop')
      ) then
        insert into public.vehicle_issues
          (vehicle_id, category, severity, description, status, auto_created)
        values (
          v.id,
          'other',
          'out_of_service',
          format('Auto-created: Amazon grounded — %s',
            coalesce(v.status_reason_message, 'no reason given')),
          'open',
          true
        );
        g := g + 1;
      end if;
    elsif v.operational_status = 'operational' then
      -- Close any open auto-issues for this van
      update public.vehicle_issues
        set status = 'fixed',
            resolved_at = now(),
            resolution_notes = coalesce(resolution_notes, '') ||
              case when resolution_notes is null or resolution_notes = '' then '' else E'\n' end ||
              format('Auto-closed: Amazon cleared van back to operational on %s.', now()::date)
        where vehicle_id = v.id
          and auto_created = true
          and status in ('open', 'in_shop');
      if found then
        u := u + 1;
      end if;
    end if;
  end loop;

  return query select g, u;
end;
$$;
grant execute on function public.apply_vehicle_grounding_changes(uuid[]) to authenticated;

comment on function public.apply_vehicle_grounding_changes is
  'Called by the vehicles import after upserts. Creates auto-issues for newly-grounded vans and closes auto-issues for vans Amazon has cleared. Skips manual-override rows.';

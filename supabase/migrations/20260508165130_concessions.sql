-- =============================================================================
-- Step 6.5 wave 3: Concessions table.
--
-- One row per individual delivery concession (a defect on a single package).
-- Source CSV is the DSP Delivery Concessions report. Each row may flag
-- multiple defect types (Incorrect Scan, No POD, etc.). Whether the
-- concession counts toward the DSP's DSB metric is captured in
-- impacts_dsb — these are the rows that show up as "DSB Count" on the
-- weekly scorecard.
-- =============================================================================

create table if not exists public.concessions (
  id                     uuid primary key default gen_random_uuid(),
  driver_id              uuid not null references public.drivers(id) on delete restrict,
  tracking_id            text not null,                  -- TBA... package id
  concession_date        timestamptz not null,
  pickup_date            timestamptz,
  delivery_attempt_date  timestamptz,
  delivery_date          timestamptz,
  delivery_type          text,                           -- "Attended" / "Unattended"
  service_area           text,
  dsp_name               text,
  impacts_dsb            boolean not null default false,
  -- Comma-separated list of defect types flagged on this concession (the
  -- columns from the CSV that were set to 1). Stored separately for
  -- searchability; raw flags also preserved in raw_data.
  defect_types           text[] not null default '{}',
  raw_data               jsonb,
  imported_from          uuid references public.file_imports(id),
  notes                  text,
  created_at             timestamptz not null default now()
);

-- Tracking ID is the natural key — one concession per package per driver.
create unique index if not exists concessions_natural_key
  on public.concessions(driver_id, tracking_id);

create index if not exists concessions_driver_date_idx
  on public.concessions(driver_id, concession_date desc);
create index if not exists concessions_dsb_idx
  on public.concessions(driver_id) where impacts_dsb = true;

alter table public.concessions enable row level security;

create policy concessions_select on public.concessions
  for select using (public.is_active_user());

create policy concessions_insert on public.concessions
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

create policy concessions_update on public.concessions
  for update
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy concessions_delete on public.concessions
  for delete
  using (public.current_user_role() in ('admin', 'manager'));

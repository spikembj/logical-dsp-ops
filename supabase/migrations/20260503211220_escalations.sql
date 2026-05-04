-- =============================================================================
-- Step 6.5 wave 2: Escalations (Amazon-issued infractions).
--
-- One row per individual incident reported by Amazon. Distinct from
-- safety_events (which is aggregated Netradyne telemetry) and from
-- coaching_sessions (which is the manager-side record of having coached).
-- An escalation is the original triggering event from Amazon's side.
--
-- Also extends import_type enum with the four new sources we'll wire in
-- across waves 2–4 so we don't need a fresh enum migration each time.
-- =============================================================================

-- Extend import_type enum
alter type public.import_type add value if not exists 'escalations';
alter type public.import_type add value if not exists 'cdf';
alter type public.import_type add value if not exists 'concessions';
alter type public.import_type add value if not exists 'pod_details';

-- escalations table
create table if not exists public.escalations (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete restrict,
  station_code        text,
  dsp_name            text,
  bucket              text,                 -- e.g. "DEFECT", "SEVERE BEHAVIOR"
  category            text,
  behavior            text not null,
  incident_date       date not null,
  dsp_notification_date date,
  ack_status          text,                 -- raw "dsp_appealed_or_da_coaching_retraining_ack" value
  scorecard_week      text,                 -- raw value from the report (string, not the period week)
  total_defects_120d  integer,
  source              text not null default 'amazon-escalations',
  raw_data            jsonb,
  imported_from       uuid references public.file_imports(id),
  notes               text,
  created_at          timestamptz not null default now()
);

-- Natural key: same driver, same date, same behavior+bucket = same incident.
-- Re-imports of the same source CSV upsert by this key.
create unique index if not exists escalations_natural_key
  on public.escalations(driver_id, incident_date, behavior, bucket);

create index if not exists escalations_driver_date_idx
  on public.escalations(driver_id, incident_date desc);

-- RLS: same shape as safety_events.
alter table public.escalations enable row level security;

create policy escalations_select on public.escalations
  for select using (public.is_active_user());

create policy escalations_insert on public.escalations
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

create policy escalations_update on public.escalations
  for update
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy escalations_delete on public.escalations
  for delete
  using (public.current_user_role() in ('admin', 'manager'));

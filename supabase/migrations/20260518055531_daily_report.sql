-- =============================================================================
-- Daily Ops — Phase C: end-of-day report
--
-- Two parts:
--
--   1. `daily_report` table — one row per date capturing the structured
--      summary the dispatchers fill in at end of day: route counts,
--      camera hits, late drivers, dispatchers on shift, incidents,
--      next-day capacity. Replaces the bottom half of the DUT7
--      Accountability Sheet.
--
--   2. New `vehicle_issues.source` column — distinguishes issues created
--      manually (default), auto-created by Amazon grounding events
--      ('grounding_auto'), and created from the end-of-day report's
--      per-van notes section ('eod'). This is the plumbing that lets
--      the EOD form's per-van notes flow straight into the issues
--      tracker — typing a note in EOD = logging a small issue, no
--      extra steps.
--
-- Permissions: daily_report is dispatcher-writable via is_operations()
-- (it's the dispatchers' closing log, same as the morning roster).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. daily_report
-- -----------------------------------------------------------------------------
create table public.daily_report (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,

  -- Who was running dispatch this day. uuid[] references users(id) by
  -- convention; no FK on array elements, so deleting a user leaves the
  -- stale UUID in past reports (the UI shows nothing for unknown IDs).
  dispatchers uuid[] not null default '{}',

  -- Route counts
  routes_total int,
  routes_reduced int,
  routes_recycled int,
  routes_ad_hocs int,

  -- Safety
  camera_hits int,
  -- Drivers who clocked out after 8pm. uuid[] references drivers(id)
  -- by convention.
  drivers_after_8pm uuid[] not null default '{}',

  -- Free-text incident log
  injuries_incidents text,

  -- Next-day capacity
  operational_vans_next_day int,
  operational_phones_next_day int,

  -- Overflow notes
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index daily_report_date_idx on public.daily_report (date desc);

create trigger daily_report_set_updated_at
  before update on public.daily_report
  for each row execute function public.set_updated_at();

comment on table public.daily_report is
  'One row per day capturing the dispatcher end-of-day summary: route counts, camera hits, late drivers, dispatchers on shift, incidents, next-day capacity. Replaces the bottom half of the DUT7 Accountability Sheet.';

alter table public.daily_report enable row level security;

create policy daily_report_select on public.daily_report
  for select using (public.is_active_user());
create policy daily_report_write on public.daily_report
  for all using (public.is_operations()) with check (public.is_operations());

grant select on public.daily_report to authenticated;
grant insert, update, delete on public.daily_report to authenticated;

-- -----------------------------------------------------------------------------
-- 2. vehicle_issues.source
-- -----------------------------------------------------------------------------
alter table public.vehicle_issues
  add column source text not null default 'manual'
  check (source in ('manual', 'eod', 'grounding_auto'));

comment on column public.vehicle_issues.source is
  'Where the issue came from: manual (Fleet page, default), eod (per-van note typed in End of Day report), grounding_auto (created automatically by apply_vehicle_grounding_changes when an Amazon import grounds a van).';

-- Backfill: any existing auto_created=true rows came from the grounding
-- auto-creator. Everything else is manual.
update public.vehicle_issues
set source = 'grounding_auto'
where auto_created = true;

create index vehicle_issues_source_idx
  on public.vehicle_issues (source, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Re-create apply_vehicle_grounding_changes() so it sets source
--    explicitly on the rows it inserts. Same body otherwise.
-- -----------------------------------------------------------------------------
create or replace function public.apply_vehicle_grounding_changes(
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
      if not exists (
        select 1 from public.vehicle_issues
        where vehicle_id = v.id
          and auto_created = true
          and status in ('open', 'in_shop')
      ) then
        insert into public.vehicle_issues
          (vehicle_id, category, severity, description, status,
           auto_created, source)
        values (
          v.id,
          'other',
          'out_of_service',
          format('Auto-created: Amazon grounded — %s',
            coalesce(v.status_reason_message, 'no reason given')),
          'open',
          true,
          'grounding_auto'
        );
        g := g + 1;
      end if;
    elsif v.operational_status = 'operational' then
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

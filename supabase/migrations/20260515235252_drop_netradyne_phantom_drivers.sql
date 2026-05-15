-- =============================================================================
-- One-time cleanup: delete drivers that only ever appeared in Netradyne data.
--
-- Context: Netradyne camera accounts often span multiple physical DSP
-- locations under one org (e.g. DUT4 + DUT7). When this app's Netradyne
-- importer auto-created drivers from every name in a CSV, it pulled in
-- drivers from the *other* DSP too — inflating the active-drivers count and
-- safety-event totals on the dashboard.
--
-- Going forward (see app/actions/netradyne-import.ts), the Netradyne import
-- no longer auto-creates drivers — unmatched names are skipped. A driver
-- only joins this DSP when they appear in a station-specific data source
-- (scorecards / DSP overview / POD details / concessions / CDF / escalations).
--
-- This migration purges the phantom drivers already in the database, defined
-- as drivers who have safety_events but no station-specific data and no
-- coaching history. Helpers (position = 'helper') are preserved unconditionally
-- — they're added manually via the Employees page and may legitimately have no
-- driving data.
-- =============================================================================

-- 1. Wipe safety_events belonging to phantom drivers (FK cleanup).
delete from public.safety_events
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and exists (select 1 from public.safety_events e where e.driver_id = d.id)
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.pod_details where driver_id = d.id)
    and not exists (select 1 from public.cdf_negative where driver_id = d.id)
    and not exists (select 1 from public.concessions where driver_id = d.id)
    and not exists (select 1 from public.escalations where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

-- 2. Drop the phantom driver rows themselves. After step 1 their safety_events
--    are gone, so the WHERE clause now correctly excludes safety_events too.
--    Any drivers with NO records anywhere also get cleaned up here (rare —
--    typically just-created rows that never got data). Helpers preserved.
delete from public.drivers d
where d.position = 'driver'
  and not exists (select 1 from public.scorecards where driver_id = d.id)
  and not exists (select 1 from public.pod_details where driver_id = d.id)
  and not exists (select 1 from public.cdf_negative where driver_id = d.id)
  and not exists (select 1 from public.concessions where driver_id = d.id)
  and not exists (select 1 from public.escalations where driver_id = d.id)
  and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
  and not exists (select 1 from public.safety_events where driver_id = d.id);

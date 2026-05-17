-- =============================================================================
-- Second-pass phantom-driver cleanup.
--
-- The first cleanup (20260515235252) only targeted drivers whose ONLY data
-- was Netradyne safety events. But the dashboard kept showing phantoms —
-- the example that surfaced this round was a driver who only had a row in
-- `concessions` (Amazon's `DSP_Delivery_Concessions_ALL_…csv` spans every
-- DSP on the account, not just our station).
--
-- This pass implements the broader policy: a driver counts as "ours" only
-- if they have a `scorecards` row (which is fed by both the per-station
-- Scorecard PDF and the per-station DSP Overview CSV — same table) or a
-- `coaching_sessions` row (manager-curated, so by definition real) or
-- position='helper' (manually added).
--
-- Everyone else — whose evidence is only `concessions` / `cdf_negative` /
-- `escalations` / `pod_details` / `safety_events` — is treated as a
-- cross-DSP phantom and removed along with their dependent records.
--
-- Going forward (paired commit), Concessions / CDF / POD / Escalations
-- imports no longer auto-create drivers, so this list cannot regrow.
-- Only Scorecard, DSP Overview, and the Employees admin page can mint
-- new driver rows.
-- =============================================================================

-- 1. Wipe dependent records FIRST (every FK to drivers is on-delete-restrict,
--    so the driver delete in step 2 would fail otherwise).
delete from public.safety_events
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

delete from public.concessions
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

delete from public.cdf_negative
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

delete from public.escalations
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

delete from public.pod_details
where driver_id in (
  select d.id from public.drivers d
  where d.position = 'driver'
    and not exists (select 1 from public.scorecards where driver_id = d.id)
    and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
);

-- 2. Drop the phantom driver rows themselves. Helpers (position='helper')
--    are preserved — they're added manually via the Employees page and may
--    legitimately have no driving data.
delete from public.drivers d
where d.position = 'driver'
  and not exists (select 1 from public.scorecards        where driver_id = d.id)
  and not exists (select 1 from public.coaching_sessions where driver_id = d.id)
  and not exists (select 1 from public.safety_events     where driver_id = d.id)
  and not exists (select 1 from public.concessions       where driver_id = d.id)
  and not exists (select 1 from public.cdf_negative      where driver_id = d.id)
  and not exists (select 1 from public.escalations       where driver_id = d.id)
  and not exists (select 1 from public.pod_details       where driver_id = d.id);

-- The not-exists clauses in step 2 are technically redundant after step 1
-- (we just deleted everything that satisfies them), but they make this
-- migration safe to re-run on a fresh DB where the deletes already happened
-- a different way — the second-pass DELETE just no-ops.

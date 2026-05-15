-- =============================================================================
-- Fix the 9 RLS policies missed by the management-roles refactor.
--
-- Migration 20260509073330_management_roles_part2.sql replaced INSERT policies
-- and a few specific UPDATE policies (coaching_sessions, safety_events) with
-- is_management(), but missed UPDATE/DELETE on the five secondary tables:
--   scorecards, concessions, escalations, cdf_negative, pod_details.
--
-- Surfaced in production when re-importing an already-loaded scorecard week
-- threw "new row violates row-level security policy (USING expression)".
-- First-time imports went through the INSERT policy (correct); re-imports
-- triggered Postgres' UPDATE path, which still required literal roles
-- 'admin' / 'manager' — both empty in this database after the roles refactor.
--
-- Idempotent: every policy is dropped-if-exists before re-creation.
-- =============================================================================

-- scorecards: UPDATE only (no delete policy exists)
drop policy if exists scorecards_update on public.scorecards;
create policy scorecards_update on public.scorecards
  for update
  using (public.is_management())
  with check (public.is_management());

-- concessions: UPDATE + DELETE
drop policy if exists concessions_update on public.concessions;
create policy concessions_update on public.concessions
  for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists concessions_delete on public.concessions;
create policy concessions_delete on public.concessions
  for delete
  using (public.is_management());

-- escalations: UPDATE + DELETE
drop policy if exists escalations_update on public.escalations;
create policy escalations_update on public.escalations
  for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists escalations_delete on public.escalations;
create policy escalations_delete on public.escalations
  for delete
  using (public.is_management());

-- cdf_negative: UPDATE + DELETE
drop policy if exists cdf_negative_update on public.cdf_negative;
create policy cdf_negative_update on public.cdf_negative
  for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists cdf_negative_delete on public.cdf_negative;
create policy cdf_negative_delete on public.cdf_negative
  for delete
  using (public.is_management());

-- pod_details: UPDATE + DELETE
drop policy if exists pod_details_update on public.pod_details;
create policy pod_details_update on public.pod_details
  for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists pod_details_delete on public.pod_details;
create policy pod_details_delete on public.pod_details
  for delete
  using (public.is_management());

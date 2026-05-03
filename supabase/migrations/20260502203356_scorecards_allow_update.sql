-- =============================================================================
-- Permit admin/manager to UPDATE scorecards rows. The import flow uses
-- INSERT ... ON CONFLICT DO UPDATE (Supabase upsert) which requires both
-- INSERT and UPDATE privileges. Without an UPDATE policy the second import
-- of the same week fails with "new row violates row-level security policy".
--
-- The original policy intent was "no user-driven edits to scorecards" — that
-- still holds; the only update path in the app is re-importing the same week,
-- which is an explicit admin/manager action through the Import page.
-- =============================================================================

create policy scorecards_update on public.scorecards
  for update
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

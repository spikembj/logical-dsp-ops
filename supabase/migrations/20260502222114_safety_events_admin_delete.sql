-- =============================================================================
-- Allow admin/manager to DELETE safety_events.
--
-- Netradyne re-imports use a wipe-and-replace strategy for events of the
-- same source + period — INSERT-only would create duplicate aggregated
-- counts for the same week. The DELETE policy scopes that capability to
-- the same roles allowed to perform imports.
-- =============================================================================

create policy safety_events_delete on public.safety_events
  for delete
  using (public.current_user_role() in ('admin', 'manager'));

-- =============================================================================
-- Part 2 of 2 — runs after the enum-value additions in part 1 have committed.
--
-- Migrates existing rows to the new role names, defines is_management(),
-- and rebuilds every RLS policy that used to gate on 'admin' or
-- ('admin','manager') so they call is_management() instead.
-- =============================================================================

update public.users set role = 'owner'        where role = 'admin';
update public.users set role = 'ops_manager'  where role = 'manager';

drop function if exists public.is_management();
create function public.is_management()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role()
    in ('owner', 'hr', 'ops_manager', 'admin', 'manager');
$$;
grant execute on function public.is_management() to authenticated;

-- -----------------------------------------------------------------------------
-- Replace every RLS policy that referenced the old role names.
-- -----------------------------------------------------------------------------
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists drivers_write on public.drivers;
create policy drivers_write on public.drivers
  for all
  using (public.is_management())
  with check (public.is_management());

drop policy if exists scorecards_insert on public.scorecards;
create policy scorecards_insert on public.scorecards
  for insert with check (public.is_management());

drop policy if exists safety_events_insert on public.safety_events;
create policy safety_events_insert on public.safety_events
  for insert with check (public.is_management());

drop policy if exists safety_events_delete on public.safety_events;
create policy safety_events_delete on public.safety_events
  for delete using (public.is_management());

drop policy if exists coaching_sessions_update on public.coaching_sessions;
create policy coaching_sessions_update on public.coaching_sessions
  for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists escalations_insert on public.escalations;
create policy escalations_insert on public.escalations
  for insert with check (public.is_management());
drop policy if exists escalations_update on public.escalations;
create policy escalations_update on public.escalations
  for update using (public.is_management()) with check (public.is_management());
drop policy if exists escalations_delete on public.escalations;
create policy escalations_delete on public.escalations
  for delete using (public.is_management());

drop policy if exists concessions_insert on public.concessions;
create policy concessions_insert on public.concessions
  for insert with check (public.is_management());
drop policy if exists concessions_update on public.concessions;
create policy concessions_update on public.concessions
  for update using (public.is_management()) with check (public.is_management());
drop policy if exists concessions_delete on public.concessions;
create policy concessions_delete on public.concessions
  for delete using (public.is_management());

drop policy if exists cdf_negative_insert on public.cdf_negative;
create policy cdf_negative_insert on public.cdf_negative
  for insert with check (public.is_management());
drop policy if exists cdf_negative_update on public.cdf_negative;
create policy cdf_negative_update on public.cdf_negative
  for update using (public.is_management()) with check (public.is_management());
drop policy if exists cdf_negative_delete on public.cdf_negative;
create policy cdf_negative_delete on public.cdf_negative
  for delete using (public.is_management());

drop policy if exists pod_details_insert on public.pod_details;
create policy pod_details_insert on public.pod_details
  for insert with check (public.is_management());
drop policy if exists pod_details_update on public.pod_details;
create policy pod_details_update on public.pod_details
  for update using (public.is_management()) with check (public.is_management());
drop policy if exists pod_details_delete on public.pod_details;
create policy pod_details_delete on public.pod_details
  for delete using (public.is_management());

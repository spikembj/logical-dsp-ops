-- =============================================================================
-- Make refresh_driver_active_status() bidirectional + include coaching_sessions.
--
-- Old version only flipped active -> inactive. So a driver who got flipped
-- once (e.g. the escalations import created them with no scorecard yet)
-- stayed inactive forever, even after a later DSP Overview / scorecard
-- import populated their week's data. New version reactivates anyone who
-- reappears in recent data.
--
-- "Recent activity" now also includes coaching_sessions — if a manager
-- has been actively coaching a driver in the last 60 days, the driver is
-- by definition still on the roster.
--
-- LOA + terminated are still untouched on purpose; both are manual
-- statuses set by humans.
-- =============================================================================

create or replace function public.refresh_driver_active_status()
returns table(activated_count int, deactivated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff_date date := current_date - interval '60 days';
  flipped_off int;
  flipped_on  int;
begin
  with active_ids as (
    select driver_id from public.scorecards     where week_ending  >= cutoff_date
    union
    select driver_id from public.safety_events  where event_date   >= cutoff_date
    union
    select driver_id from public.coaching_sessions
      where session_date >= cutoff_date and voided_at is null
  )

  -- 1. Stale active -> inactive
  , flipped_to_inactive as (
    update public.drivers
      set status = 'inactive'
      where status = 'active'
        and id not in (select driver_id from active_ids)
    returning 1
  )

  -- 2. Returning inactive -> active (someone reappeared in fresh data)
  , flipped_to_active as (
    update public.drivers
      set status = 'active'
      where status = 'inactive'
        and id in (select driver_id from active_ids)
    returning 1
  )

  select
    (select count(*) from flipped_to_active),
    (select count(*) from flipped_to_inactive)
  into flipped_on, flipped_off;

  activated_count   := flipped_on;
  deactivated_count := flipped_off;
  return next;
end;
$$;

grant execute on function public.refresh_driver_active_status() to authenticated;

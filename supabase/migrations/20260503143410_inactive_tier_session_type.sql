-- =============================================================================
-- Step 6 hotfixes:
--   1. Add 'inactive' to driver_status (drivers with no recent activity).
--   2. Extend tier enum with Platinum/Gold/Silver/Bronze (Amazon's new
--      naming, used by the DSP Overview Dashboard CSV — not yet imported,
--      but the values need to exist before that import runs).
--   3. Add a coaching_session_type enum + column to coaching_sessions
--      (Discussion / Verbal warning / Write up / Final warning / Termination).
--   4. Add refresh_driver_active_status() — flips drivers with no recent
--      activity (last 60 days) from 'active' to 'inactive'. Called by import
--      flows after they finish; also runnable manually as a one-shot.
-- =============================================================================

-- 1. driver_status: add 'inactive'
alter type public.driver_status add value if not exists 'inactive';

-- 2. tier enum: add the Platinum/Gold/Silver/Bronze names
alter type public.tier add value if not exists 'platinum';
alter type public.tier add value if not exists 'gold';
alter type public.tier add value if not exists 'silver';
alter type public.tier add value if not exists 'bronze';

-- 3. coaching_session_type enum + column
do $$
begin
  if not exists (select 1 from pg_type where typname = 'coaching_session_type') then
    create type public.coaching_session_type as enum (
      'discussion',
      'verbal_warning',
      'write_up',
      'final_warning',
      'termination'
    );
  end if;
end$$;

alter table public.coaching_sessions
  add column if not exists session_type public.coaching_session_type
    not null default 'discussion';

create index if not exists coaching_sessions_session_type_idx
  on public.coaching_sessions(session_type);

-- 4. Auto-deactivate drivers with no recent activity. Window: 60 days.
--    Only flips drivers currently 'active' — never overrides 'loa' or
--    'terminated' (those were set by humans on purpose).
create or replace function public.refresh_driver_active_status()
returns table(deactivated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff_date date := current_date - interval '60 days';
  cnt int;
begin
  with active_ids as (
    select driver_id from public.scorecards where week_ending >= cutoff_date
    union
    select driver_id from public.safety_events where event_date >= cutoff_date
  )
  update public.drivers
    set status = 'inactive'
    where status = 'active'
      and id not in (select driver_id from active_ids);
  get diagnostics cnt = row_count;
  deactivated_count := cnt;
  return next;
end;
$$;

grant execute on function public.refresh_driver_active_status() to authenticated;

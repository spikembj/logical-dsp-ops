-- =============================================================================
-- Step 3.5: void support + admin-only edits + acknowledge-via-function.
--
-- - Adds voided_at / voided_by / void_reason to coaching_sessions for soft-
--   delete with a required reason.
-- - Tightens the UPDATE RLS policy so only admins can mutate session content
--   (topic, notes, date) or void/unvoid.
-- - Introduces a SECURITY DEFINER function set_coaching_acknowledged() so any
--   active user can flip the acknowledged toggle without being able to edit
--   the rest of the row. The function still goes through UPDATE, so the
--   existing log_coaching_session_revision trigger captures the prior state
--   into coaching_session_revisions — audit chain unchanged.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema: void columns
-- -----------------------------------------------------------------------------
alter table public.coaching_sessions
  add column voided_at   timestamptz,
  add column voided_by   uuid references public.users(id),
  add column void_reason text;

-- A session is either fully voided (all three set) or fully not (all null).
alter table public.coaching_sessions
  add constraint coaching_sessions_void_consistency check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null and length(trim(void_reason)) > 0)
  );

create index coaching_sessions_voided_idx
  on public.coaching_sessions(voided_at)
  where voided_at is not null;

-- -----------------------------------------------------------------------------
-- 2. Tighten UPDATE policy: admin-only for everything except acknowledge.
-- -----------------------------------------------------------------------------
drop policy if exists coaching_sessions_update on public.coaching_sessions;

create policy coaching_sessions_update on public.coaching_sessions
  for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- -----------------------------------------------------------------------------
-- 3. Acknowledge function: any active user can flip the acknowledged column.
--    Runs as security definer to bypass RLS, but only touches the two
--    acknowledgment columns — every other field is untouched.
-- -----------------------------------------------------------------------------
create or replace function public.set_coaching_acknowledged(
  p_session_id uuid,
  p_acknowledged boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Caller must be an active user.
  if not public.is_active_user() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  update public.coaching_sessions
  set acknowledged = p_acknowledged,
      acknowledged_at = case when p_acknowledged then now() else null end
  where id = p_session_id
    and voided_at is null;  -- can't acknowledge a voided session
end;
$$;

-- Allow any signed-in role to call the function (RLS-bypassing logic is
-- inside the function body via is_active_user()).
grant execute on function public.set_coaching_acknowledged(uuid, boolean)
  to authenticated;

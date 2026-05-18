-- =============================================================================
-- HR Phase 3 — Pass A
--
-- Adds an HR review sign-off layer to coaching_sessions. Every session
-- whose session_type is NOT in ('discussion','training') needs HR to
-- confirm they have done their side of the work (filed paperwork, sent
-- official comms, etc.) before the row stops being "actionable" from
-- HR's point of view.
--
-- Trainings + discussions skip review entirely — they leave hr_reviewed_at
-- null forever, and the HR queue query filters them out.
-- =============================================================================

alter table public.coaching_sessions
  add column hr_reviewed_at  timestamptz,
  add column hr_reviewed_by  uuid references public.users(id) on delete set null,
  add column hr_review_notes text;

comment on column public.coaching_sessions.hr_reviewed_at is
  'Stamped when HR clicks Reviewed on the HR coaching queue. NULL = still waiting on HR sign-off. Trainings + discussions skip this field entirely (they do not require review).';

comment on column public.coaching_sessions.hr_review_notes is
  'Private HR note attached at review time (e.g. "sent termination letter", "verified with Curtis"). Optional.';

-- Index supports the HR queue query:
--   where session_type not in ('discussion','training')
--   and hr_reviewed_at is null
--   order by session_date desc
create index coaching_sessions_hr_review_idx
  on public.coaching_sessions (session_date desc)
  where hr_reviewed_at is null
    and session_type not in ('discussion','training');

-- Index supports the worst-10-offenders query:
--   where session_date > now() - interval '90 days'
--   and session_type not in ('discussion','training')
--   group by driver_id
create index coaching_sessions_driver_recent_idx
  on public.coaching_sessions (driver_id, session_date)
  where session_type not in ('discussion','training');

-- =============================================================================
-- Add a `category` column to coaching_sessions so triggers can be cleared
-- per-category (safety / quality / escalation / other), not just "any session
-- in window".
--
-- Why: today, logging *any* coaching session removes a driver from BOTH the
-- safety and quality needs-coaching lists for the week. Too aggressive — a
-- driver with both kinds of issues needs both kinds of conversations, but
-- the second one disappears from the list after the first session.
--
-- After this, coaching a safety issue clears only the safety trigger; the
-- quality trigger stays visible until coached separately. Same for
-- escalations. `other` covers write-ups, follow-ups, and any session not
-- tied to a specific category — these don't clear any trigger.
--
-- Defaulting existing rows to 'other' is deliberate: we can't retroactively
-- know what a pre-Pass-13 session was for, so the safest is "doesn't clear
-- anything". Going forward, sessions logged from a trigger button auto-set
-- their category from the trigger context.
-- =============================================================================

alter table public.coaching_sessions
  add column category text not null default 'other';

alter table public.coaching_sessions
  add constraint coaching_sessions_category_check
  check (category in ('safety', 'quality', 'escalation', 'other'));

comment on column public.coaching_sessions.category is
  'Trigger category this session addressed. Used to clear the matching trigger from needs-coaching lists. "other" is the catch-all for write-ups and untriggered sessions.';

create index coaching_sessions_driver_category_date_idx
  on public.coaching_sessions (driver_id, category, session_date desc)
  where voided_at is null;

-- =============================================================================
-- Extend coaching_sessions.category with the 11 policy-point categories
-- from the dispatcher's existing write-up workflow.
--
-- Existing 4 (safety / quality / escalation / other) keep their meaning
-- and KEEP clearing the matching trigger from the dashboard. The new
-- 11 are user-facing labels for write-ups; they do NOT clear triggers
-- (same behavior as 'other' today).
--
-- This lets the dispatcher log a write-up with the same vocabulary
-- they already use ("No Call No Show", "Van Damage", etc.) without
-- splitting coaching across two systems.
-- =============================================================================

alter table public.coaching_sessions
  drop constraint coaching_sessions_category_check;

alter table public.coaching_sessions
  add constraint coaching_sessions_category_check
  check (category in (
    -- Trigger-clearing categories (set automatically when a coaching
    -- session is logged from a trigger button on the dashboard).
    'safety',
    'quality',
    'escalation',
    'other',
    -- Policy-point write-up categories (manually picked by the
    -- dispatcher; do NOT clear any trigger).
    'same_day_call_off',
    'no_call_no_show',
    'abandon_route',
    'safety_concern',
    'quality_issue',
    'behavior_issue',
    'van_damage',
    'property_damage',
    'slept_in',
    'quit',
    'unable_to_finish'
  ));

comment on column public.coaching_sessions.category is
  'Either a trigger-clearing category (safety / quality / escalation / other) set when the dialog is opened from a trigger button, or a policy-point write-up category (same_day_call_off, no_call_no_show, abandon_route, safety_concern, quality_issue, behavior_issue, van_damage, property_damage, slept_in, quit, unable_to_finish). Only the first four clear triggers — the policy categories are purely descriptive.';

-- Add a new import_type value for the one-off Policy Points CSV backfill.
alter type public.import_type add value if not exists 'policy_points';

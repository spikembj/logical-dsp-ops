-- =============================================================================
-- Add 'training' to the coaching_session_type enum.
--
-- New value sits alongside the existing levels (discussion / verbal_warning
-- / write_up / final_warning / termination). Used as the default
-- session_type when the Log Session dialog is opened from a trigger row
-- (dashboard hero list, per-driver Triggers panel category card) — those
-- are stats-coaching sessions, distinct from disciplinary discussions.
--
-- The category column (added in 20260516072730) keeps tracking which
-- trigger the session cleared (safety / quality / escalation / other),
-- but it's no longer exposed in the dialog — set automatically from
-- where the dialog was opened.
-- =============================================================================

alter type public.coaching_session_type add value if not exists 'training';

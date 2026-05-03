-- =============================================================================
-- Add overall_score to scorecards.
--
-- The DSP Overview Dashboard CSV (Amazon's new per-driver weekly export)
-- provides a per-driver "Overall Score" — a 0–100 value paired with the
-- "Overall Standing" tier. The scorecard PDF only had this at DSP level,
-- so we never stored it; with the CSV import landing, we want it per-row.
-- =============================================================================

alter table public.scorecards
  add column if not exists overall_score numeric;

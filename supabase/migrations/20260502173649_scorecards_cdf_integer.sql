-- =============================================================================
-- Hotfix: scorecards.cdf type — was numeric(6,3) (max 999.999) but real
-- CDF DPMO values (Defects Per Million Opportunities) are 4–6 digit
-- integers. Real-world max is ~1,000,000.
--
-- Also widen the safety rates as a precaution. They're "events per 100
-- trips" and realistically 0–50, but the migration changes them all to
-- numeric without an explicit precision so we never get an overflow on
-- an unexpectedly large value from a future format change.
-- =============================================================================

alter table public.scorecards
  alter column cdf type integer using round(cdf)::integer;

alter table public.scorecards
  alter column dcr                         type numeric using dcr::numeric,
  alter column delivery_completion_rate    type numeric using delivery_completion_rate::numeric,
  alter column seatbelt_off_rate           type numeric using seatbelt_off_rate::numeric,
  alter column speeding_event_rate         type numeric using speeding_event_rate::numeric,
  alter column distractions_rate           type numeric using distractions_rate::numeric,
  alter column following_distance_rate     type numeric using following_distance_rate::numeric,
  alter column sign_signal_violations_rate type numeric using sign_signal_violations_rate::numeric;

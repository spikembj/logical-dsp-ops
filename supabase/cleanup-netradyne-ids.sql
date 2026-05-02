-- =============================================================================
-- One-shot cleanup, run ONCE in the Supabase SQL editor after applying the
-- migration that makes transporter_id nullable.
--
-- The original drivers seed put Netradyne's internal IDs in transporter_id
-- by mistake — those are different from the Amazon transporter IDs that
-- appear on the weekly scorecard. This clears the wrong values so the next
-- scorecard import can populate the correct ones via name matching.
--
-- Coaching sessions, drivers themselves, and all other data are preserved.
-- =============================================================================

update public.drivers set transporter_id = null;

-- Verify: should return 0 rows.
-- select count(*) from public.drivers where transporter_id is not null;

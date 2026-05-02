-- =============================================================================
-- Step 4 prep: relax drivers.transporter_id to nullable.
--
-- Reason: the existing seed used Netradyne's internal IDs as transporter_id,
-- but the canonical transporter_id is Amazon's short A-prefixed ID found on
-- the weekly scorecard PDF. Until a driver appears in a scorecard import,
-- we may not have an Amazon transporter ID for them yet. Making the column
-- nullable lets new drivers exist with name + status only, then get their
-- transporter_id populated by the first scorecard import that includes them.
--
-- After this migration runs, the user runs scripts/cleanup-netradyne-ids.sql
-- once to clear the wrong values that the seed put there.
-- =============================================================================

alter table public.drivers
  alter column transporter_id drop not null;

-- The existing unique index already permits NULL values (Postgres treats
-- multiple NULLs as distinct in unique indexes), so no further changes
-- needed.

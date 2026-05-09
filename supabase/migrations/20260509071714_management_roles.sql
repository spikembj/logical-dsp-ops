-- =============================================================================
-- Part 1 of 2 — adds the new enum values only.
-- Postgres requires new enum values to commit before they can be used in
-- DML, so the data migration + RLS rewrites live in a separate file
-- (20260509073330_management_roles_part2.sql) that runs after this one.
-- =============================================================================

-- Everything else lives in part 2.

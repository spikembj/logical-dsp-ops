-- =============================================================================
-- Grant baseline privileges to Supabase's built-in roles.
--
-- Background: Postgres RLS policies only take effect AFTER the role has
-- table-level privileges (GRANT ...). Supabase used to auto-grant these for
-- tables created in the public schema, but no longer does — so without this
-- migration the `authenticated` role gets a "permission denied for table"
-- error before RLS is even evaluated.
--
-- Pattern: grant ALL on every table in public to anon/authenticated/service_role.
-- Actual access is then gated entirely by the RLS policies in 0001_init.sql.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Apply the same grants to anything we create in this schema later, so future
-- migrations don't have to repeat this dance.
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

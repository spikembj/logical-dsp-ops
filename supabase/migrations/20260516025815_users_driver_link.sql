-- =============================================================================
-- Add an optional FK from public.users to public.drivers.
--
-- Use case: dispatchers who also drive routes (e.g. Colby, Manuel, Athena
-- at this DSP). Today they have two unlinked records — a users row for
-- their dispatcher login and a drivers row for their driving data. This
-- FK lets the Management page surface the link and jump straight to the
-- driver's profile.
--
-- Properties:
--   - Nullable: most users are not also drivers.
--   - ON DELETE SET NULL: if the driver record is deleted (manual cleanup,
--     phantom-purge migration, etc.) the link disappears; the user row
--     stays intact.
--   - Unique (partial): one driver record can be linked to at most one
--     user, and one user to at most one driver. NULL allowed everywhere.
-- =============================================================================

alter table public.users
  add column driver_id uuid references public.drivers(id) on delete set null;

create unique index users_driver_id_unique_idx
  on public.users(driver_id)
  where driver_id is not null;

comment on column public.users.driver_id is
  'Optional FK to drivers — for dispatchers who also drive routes. Nullable, unique.';

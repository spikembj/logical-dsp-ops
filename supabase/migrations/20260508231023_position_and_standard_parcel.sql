-- =============================================================================
-- Two changes:
--   1. Rename the vehicle_type enum value 'step_van' to 'standard_parcel'
--      to match what the user calls them in practice. Existing rows are
--      migrated automatically by Postgres.
--   2. Add a driver_position enum ('driver' | 'helper') and a position
--      column on drivers, default 'driver'. Helpers ride along but are
--      not approved to drive any vehicle.
-- =============================================================================

alter type public.vehicle_type rename value 'step_van' to 'standard_parcel';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'driver_position') then
    create type public.driver_position as enum ('driver', 'helper');
  end if;
end$$;

alter table public.drivers
  add column if not exists position public.driver_position
    not null default 'driver';

create index if not exists drivers_position_idx on public.drivers(position);

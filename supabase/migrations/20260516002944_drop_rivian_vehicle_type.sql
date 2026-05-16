-- =============================================================================
-- Drop the 'rivian' value from the vehicle_type enum.
--
-- Per the user: at this DSP, Rivians are operated as EDVs and the distinction
-- isn't meaningful — every Rivian-approved driver is also EDV-approved. Keeping
-- two values just split the data and forced operators to remember which to
-- check. Collapsing to (cdv / edv / standard_parcel).
--
-- Postgres can't drop an enum value in place; standard workaround is to:
--   1. Migrate any existing 'rivian' values out of array columns
--   2. Rename the old enum out of the way
--   3. Create the new enum without the value
--   4. Re-cast the array column to the new enum
--   5. Drop the old enum
-- =============================================================================

-- 1. Replace any 'rivian' values in approved_vehicle_types with 'edv', dedup.
update public.drivers d
set approved_vehicle_types = (
  select array(
    select distinct
      case when v = 'rivian'::vehicle_type then 'edv'::vehicle_type else v end
    from unnest(d.approved_vehicle_types) as v
  )
)
where 'rivian' = any(d.approved_vehicle_types);

-- 2. Drop the column default — Postgres can't auto-cast a default that
--    references the old enum during the upcoming ALTER COLUMN TYPE.
alter table public.drivers
  alter column approved_vehicle_types drop default;

-- 3-6. Swap the enum.
alter type public.vehicle_type rename to vehicle_type__old;

create type public.vehicle_type as enum ('cdv', 'edv', 'standard_parcel');

alter table public.drivers
  alter column approved_vehicle_types
  type public.vehicle_type[]
  using approved_vehicle_types::text[]::public.vehicle_type[];

-- 7. Restore the default using the new enum.
alter table public.drivers
  alter column approved_vehicle_types
  set default '{}'::public.vehicle_type[];

-- 8. Drop the old enum.
drop type public.vehicle_type__old;

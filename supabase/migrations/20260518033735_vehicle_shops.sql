-- =============================================================================
-- vehicle_shops — managed lookup of where a van currently is.
--
-- Replaces the free-text `vehicles.current_shop_location` with a
-- foreign-keyed value backed by a small admin-editable table. The list
-- intentionally mixes actual shop names (Jiffy Lube, Bountiful Ram
-- Dealer, etc.) with location/status values (LGCL Parking Lot, DUT4,
-- Inactive, Return, Returned, In Use) — that's how the dispatcher
-- already thinks of this column in their spreadsheet, and they want
-- one constrained list rather than two.
--
-- Migration steps:
--   1. Create vehicle_shops + RLS + grants
--   2. Seed with 19 values from the dispatcher's current list
--   3. Add vehicles.current_shop_id FK (nullable, on delete set null)
--   4. Backfill from existing text via case-insensitive trimmed match
--   5. Mark old text column DEPRECATED (don't drop yet — preserves the
--      original values for any text that didn't match a shop name, in
--      case we need to reconcile)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table + RLS.
-- -----------------------------------------------------------------------------
create table public.vehicle_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_shops_sort_idx
  on public.vehicle_shops (active desc, sort_order, name);

create trigger vehicle_shops_set_updated_at
  before update on public.vehicle_shops
  for each row execute function public.set_updated_at();

alter table public.vehicle_shops enable row level security;

create policy vehicle_shops_select on public.vehicle_shops
  for select using (public.is_active_user());
create policy vehicle_shops_write on public.vehicle_shops
  for all using (public.is_management()) with check (public.is_management());

grant select on public.vehicle_shops to authenticated;
grant insert, update, delete on public.vehicle_shops to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Seed with the dispatcher's current list. sort_order matches the
--    order they have in the spreadsheet dropdown so the UI feels familiar.
-- -----------------------------------------------------------------------------
insert into public.vehicle_shops (name, sort_order) values
  ('In Use',                             10),
  ('LGCL Parking Lot',                   20),
  ('DUT4',                               30),
  ('Jiffy Lube',                         40),
  ('Goodyear',                           50),
  ('Rivian Dealer',                      60),
  ('Bountiful Ram Dealer',               70),
  ('Performance Ford Woods Cross Dealer',80),
  ('Masud''s Shop',                      90),
  ('Other Shop / Dealer',               100),
  ('Inactive',                          110),
  ('Return',                            120),
  ('Returned',                          130),
  ('LHM Sandy Dodge',                   140),
  ('Salt Lake Valley Dodge Dealer',     150),
  ('West Valley Ken Garff Dealer',      160),
  ('Big O',                             170),
  ('Penske West Valley',                180),
  ('Draper Ford Dealer',                190);

-- -----------------------------------------------------------------------------
-- 3. FK column.
-- -----------------------------------------------------------------------------
alter table public.vehicles
  add column current_shop_id uuid
  references public.vehicle_shops(id) on delete set null;

create index vehicles_current_shop_idx
  on public.vehicles (current_shop_id)
  where current_shop_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Backfill — case-insensitive, trimmed name match.
-- -----------------------------------------------------------------------------
update public.vehicles v
set current_shop_id = s.id
from public.vehicle_shops s
where v.current_shop_location is not null
  and trim(v.current_shop_location) <> ''
  and lower(trim(v.current_shop_location)) = lower(trim(s.name));

-- -----------------------------------------------------------------------------
-- 5. Mark old column deprecated. App code stops reading/writing it; we
--    keep the values around in case any didn't backfill cleanly so the
--    user can spot them.
-- -----------------------------------------------------------------------------
comment on column public.vehicles.current_shop_location is
  'DEPRECATED — replaced by current_shop_id (FK to vehicle_shops). Old text values preserved for one cycle in case backfill missed anything. Safe to drop in a follow-up migration once verified.';

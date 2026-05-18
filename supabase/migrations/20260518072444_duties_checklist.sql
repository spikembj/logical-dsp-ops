-- =============================================================================
-- Daily Ops — Phase E: duties checklist
--
-- Two tables:
--
--   `duties_template_items` — the master list of recurring tasks.
--   Each row has a cadence (daily/weekly/monthly), an optional group
--   (preload_out/load_out/post_load_out/rts/closing for daily; null
--   for weekly/monthly), an owner label (free text — Dispatcher,
--   Assistant, Michael, Barzin, etc.), a description, and a sort
--   order. Management edits via /admin/duties.
--
--   `duties_completion` — one row per (template item, period) marking
--   that item as done. Period key formats:
--     daily   = YYYY-MM-DD
--     weekly  = YYYY-WNN  (ISO week, Mon-Sun)
--     monthly = YYYY-MM
--   Unique on (template_item_id, period_key) — clicking the same
--   checkbox twice no-ops cleanly via upsert (and unclicking deletes).
--
-- Write permissions: is_operations() (dispatcher + management) — same
-- as the morning roster and end-of-day report. Anyone working a shift
-- can tick items as they finish them.
--
-- Templates are management-only since they're configuration.
--
-- Seeded with the dispatcher's existing DUT7 Duties Checklist contents
-- so the page is useful day-one.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- duties_template_items
-- -----------------------------------------------------------------------------
create table public.duties_template_items (
  id uuid primary key default gen_random_uuid(),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  group_label text check (
    group_label is null or group_label in (
      'preload_out', 'load_out', 'post_load_out', 'rts', 'closing'
    )
  ),
  owner_label text not null,
  description text not null,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index duties_template_items_cadence_idx
  on public.duties_template_items (active desc, cadence, group_label, sort_order);

create trigger duties_template_items_set_updated_at
  before update on public.duties_template_items
  for each row execute function public.set_updated_at();

alter table public.duties_template_items enable row level security;

create policy duties_template_items_select on public.duties_template_items
  for select using (public.is_active_user());
create policy duties_template_items_write on public.duties_template_items
  for all using (public.is_management()) with check (public.is_management());

grant select on public.duties_template_items to authenticated;
grant insert, update, delete on public.duties_template_items to authenticated;

-- -----------------------------------------------------------------------------
-- duties_completion
-- -----------------------------------------------------------------------------
create table public.duties_completion (
  id uuid primary key default gen_random_uuid(),
  template_item_id uuid not null references public.duties_template_items(id)
    on delete cascade,
  period_key text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.users(id) on delete set null,
  unique (template_item_id, period_key)
);

create index duties_completion_period_idx
  on public.duties_completion (period_key, template_item_id);

alter table public.duties_completion enable row level security;

create policy duties_completion_select on public.duties_completion
  for select using (public.is_active_user());
create policy duties_completion_write on public.duties_completion
  for all using (public.is_operations()) with check (public.is_operations());

grant select on public.duties_completion to authenticated;
grant insert, update, delete on public.duties_completion to authenticated;

-- -----------------------------------------------------------------------------
-- Seed — extracted from the dispatcher's existing DUT7 Duties Checklist
-- spreadsheet. Sort orders are spaced 10 apart per group so management
-- can insert items between existing ones without renumbering everything.
-- -----------------------------------------------------------------------------

-- DAILY · Dispatcher · PRELOAD OUT
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'preload_out', 'Dispatcher', 'Check EDV charging percentages', 10),
  ('daily', 'preload_out', 'Dispatcher', 'Review grounding and vehicle dashboard', 20),
  ('daily', 'preload_out', 'Dispatcher', 'Coordinate new drivers with trainers', 30),
  ('daily', 'preload_out', 'Dispatcher', 'Rostering assignments', 40),
  ('daily', 'preload_out', 'Dispatcher', 'Daily paper completed and printed', 50),
  ('daily', 'preload_out', 'Dispatcher', 'Review routes for safety issues, driver affinity, preferences, and van capabilities and message drivers', 60),
  ('daily', 'preload_out', 'Dispatcher', 'Review previous day Dispatch Chime Room', 70),
  ('daily', 'preload_out', 'Dispatcher', 'Post message to drivers if we have too many extras to reduce the number', 80),
  ('daily', 'preload_out', 'Dispatcher', 'Communicate with OTR to see status of reductions and ad hocs', 90),
  ('daily', 'preload_out', 'Dispatcher', 'Check text messages on Dispatch Phone', 100);

-- DAILY · Assistant · PRELOAD OUT
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'preload_out', 'Assistant', 'Load van bags or review bags and ensure all contents are there', 200),
  ('daily', 'preload_out', 'Assistant', 'Review previous day quality and safety dashboard metrics and message all drivers with issues via chime', 210),
  ('daily', 'preload_out', 'Assistant', 'Review Netradyne infractions from the day before and ensure drivers have been messaged and responded', 220),
  ('daily', 'preload_out', 'Assistant', 'Water for drivers', 230);

-- DAILY · Dispatcher · LOAD OUT
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'load_out', 'Dispatcher', 'Talk with Soud about any van issues', 10),
  ('daily', 'load_out', 'Dispatcher', 'Talk with drivers about route issues or other coaching notifications from the day prior', 20),
  ('daily', 'load_out', 'Dispatcher', 'Stand up Meeting', 30),
  ('daily', 'load_out', 'Dispatcher', 'Assist drivers with locating routes', 40),
  ('daily', 'load_out', 'Dispatcher', 'Walk staging locations for missing carts or late stages', 50),
  ('daily', 'load_out', 'Dispatcher', 'Correct down stacking, seat belt buckled, or other unsafe behaviors in the launch pad', 60),
  ('daily', 'load_out', 'Dispatcher', 'Communicate with OTR about van issues or groundings', 70),
  ('daily', 'load_out', 'Dispatcher', 'Ensure all drivers have swiped to finish', 80);

-- DAILY · Assistant · LOAD OUT
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'load_out', 'Assistant', 'Make sure cart has Water, Cleaner, jumper box and Garbage bag brought out for drivers to use', 200),
  ('daily', 'load_out', 'Assistant', 'Message drivers 5 minutes after show-up time to see who is not there', 210),
  ('daily', 'load_out', 'Assistant', 'Uniform audit of drivers', 220);

-- DAILY · Dispatcher · POST LOAD OUT
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'post_load_out', 'Dispatcher', 'Show extra drivers their stats and communicate with them about areas of improvement', 10),
  ('daily', 'post_load_out', 'Dispatcher', 'Send the beginning of the day message to drivers (mentor, safety, etc)', 20),
  ('daily', 'post_load_out', 'Dispatcher', 'Changes to vehicle assignments are updated to the current day''s sheet', 30),
  ('daily', 'post_load_out', 'Dispatcher', 'Policy Point page is updated', 40),
  ('daily', 'post_load_out', 'Dispatcher', 'Communication with Billie for any issues with personnel or new drivers', 50),
  ('daily', 'post_load_out', 'Dispatcher', 'Coordinate dropping off vans to dealerships or picking them up', 60),
  ('daily', 'post_load_out', 'Dispatcher', 'AndGo / Jiffy Lube appointments made', 70),
  ('daily', 'post_load_out', 'Dispatcher', 'Work summary tool reviewed for previous day training', 80),
  ('daily', 'post_load_out', 'Dispatcher', 'Work Summary tool reviewed for previous day routes / ad-hoc', 90),
  ('daily', 'post_load_out', 'Dispatcher', 'Work Hour Compliance page is updated and drivers messaged', 100),
  ('daily', 'post_load_out', 'Dispatcher', 'New drivers messaged', 110),
  ('daily', 'post_load_out', 'Dispatcher', 'Trainer selected and messaged for new drivers starting the next day', 120),
  ('daily', 'post_load_out', 'Dispatcher', 'Submit problem routes via Geosource or Qualtrics', 130),
  ('daily', 'post_load_out', 'Dispatcher', 'Review camera footage for 2 drivers', 140),
  ('daily', 'post_load_out', 'Dispatcher', 'Parts for vehicles are ordered and invoices sent via chime', 150),
  ('daily', 'post_load_out', 'Dispatcher', 'Rostering is completed by 7PM', 160),
  ('daily', 'post_load_out', 'Dispatcher', 'Screens fixed on phones', 170);

-- DAILY · Dispatcher · RTS
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'rts', 'Dispatcher', 'You have cleaner, towels, garbage bag, clipboard', 10),
  ('daily', 'rts', 'Dispatcher', 'Van parked for dispatch', 20),
  ('daily', 'rts', 'Dispatcher', 'Be in parking lot when first driver returns', 30),
  ('daily', 'rts', 'Dispatcher', 'Last driver should be returning to station by 7:30 PM clocking out at 8:30 PM LATEST', 40),
  ('daily', 'rts', 'Dispatcher', 'Cracked windshields scheduled with ICON Glass', 50),
  ('daily', 'rts', 'Dispatcher', 'AndGo Appointments made and vehicles moved', 60),
  ('daily', 'rts', 'Dispatcher', 'Has the new driver confirmed for tomorrow as well as trainer if applicable', 70);

-- DAILY · Assistant · RTS
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'rts', 'Assistant', 'Ensure drivers are parking in proper parking stall', 200),
  ('daily', 'rts', 'Assistant', 'Walk around and check every vehicle that returns', 210),
  ('daily', 'rts', 'Assistant', 'Review van bag when the driver hands it to you for all contents', 220),
  ('daily', 'rts', 'Assistant', 'Review stats and coach drivers', 230);

-- DAILY · Dispatcher · CLOSING
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'closing', 'Dispatcher', 'Soud messaged with list of vehicle issues', 10),
  ('daily', 'closing', 'Dispatcher', 'Review rostering to ensure accuracy and changes made', 20),
  ('daily', 'closing', 'Dispatcher', 'Review DVICs', 30),
  ('daily', 'closing', 'Dispatcher', 'Post DVIC in LGCL chime group', 40),
  ('daily', 'closing', 'Dispatcher', 'Post end-of-day message in DISPATCH chat tagging Curtis and next-day dispatch', 50),
  ('daily', 'closing', 'Dispatcher', 'Put away computer and other valuables and lock cages and file cabinet', 60),
  ('daily', 'closing', 'Dispatcher', 'Lost and Found items posted in the Company Chat Room', 70);

-- DAILY · Assistant · CLOSING
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('daily', 'closing', 'Assistant', 'Create Chime rooms for the next day', 200),
  ('daily', 'closing', 'Assistant', 'Plug in all power banks and phones', 210),
  ('daily', 'closing', 'Assistant', 'Lock trailer and ensure no tires or valuables are left out', 220),
  ('daily', 'closing', 'Assistant', 'Water in the freezer', 230),
  ('daily', 'closing', 'Assistant', 'Jumper box is charging', 240),
  ('daily', 'closing', 'Assistant', 'Nothing is left on the top of the cages', 250);

-- WEEKLY (group_label is null — weekly items are a single flat list)
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('weekly', null, 'Michael', 'Trailer cleaned and organized', 10),
  ('weekly', null, 'Michael', 'Cages cleaned and organized', 20),
  ('weekly', null, 'Michael', 'Wagon is cleaned out', 30),
  ('weekly', null, 'Michael', 'Uniform inventory sent to Curtis', 40),
  ('weekly', null, 'Barzin', 'Contest winners are posted in Announcements chat Wednesday 4 PM', 50),
  ('weekly', null, 'Barzin', 'Scorecards are posted in the Announcements chat Wednesday 4 PM', 60),
  ('weekly', null, 'Barzin', 'Dealerships are called and updates provided for all vehicles', 70),
  ('weekly', null, 'Barzin', 'Masud is called and updates provided for all vehicles', 80),
  ('weekly', null, 'Barzin', 'LMR registration and bookings reviewed', 90),
  ('weekly', null, 'Barzin', 'Review support cases for all down vehicles by Thursday 12 PM', 100);

-- MONTHLY (group_label is null — monthly items are a single flat list)
insert into public.duties_template_items
  (cadence, group_label, owner_label, description, sort_order) values
  ('monthly', null, 'Barzin', 'Registration audit', 10),
  ('monthly', null, 'Michael', 'Gas card audit and email sent', 20),
  ('monthly', null, 'Michael', 'Phone Inventory done', 30);

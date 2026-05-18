-- =============================================================================
-- HR Phase 3 — Pass B: scope column on duties_template_items + HR daily seed
--
-- One scope column lets us reuse the entire duties engine (tables,
-- queries, server actions, period-key logic, checkbox UI, inline edit)
-- for both surfaces:
--
--   scope='ops' — /duties (dispatch + ops mgmt; the original module)
--   scope='hr'  — /hr/duties (HR + ops mgmt only; invisible to dispatchers)
--
-- duties_completion intentionally has NO scope column — it joins through
-- template_item_id which carries the scope. Cleaner FK story, no duplicated
-- check.
-- =============================================================================

alter table public.duties_template_items
  add column scope text not null default 'ops'
    check (scope in ('ops', 'hr'));

comment on column public.duties_template_items.scope is
  'Which surface owns this checklist item. ops = /duties (dispatch + ops mgmt). hr = /hr/duties (HR + ops mgmt). Separate scopes so dispatchers never see HR items and HR never sees dispatch duties on their summary card.';

create index duties_template_items_scope_idx
  on public.duties_template_items
  (scope, active desc, cadence, group_label, sort_order);

-- Seed HR daily checklist from the dispatcher's existing spreadsheet
-- "Open" status group. group_label is null for HR — the
-- preload/loadout/etc. buckets are dispatch-specific and would be
-- meaningless on HR's day. Owner defaults to 'HR'; reassign inline
-- if HR splits work across multiple people later.
insert into public.duties_template_items
  (scope, cadence, group_label, owner_label, description, sort_order) values
  ('hr', 'daily', null, 'HR', 'ADP People In-Progress',       10),
  ('hr', 'daily', null, 'HR', 'Files',                        20),
  ('hr', 'daily', null, 'HR', 'Check in with new hires',      30),
  ('hr', 'daily', null, 'HR', 'ADP',                          40),
  ('hr', 'daily', null, 'HR', 'Make Files for new employees', 50),
  ('hr', 'daily', null, 'HR', 'ADP People to Start',          60),
  ('hr', 'daily', null, 'HR', 'Human Interest',               70),
  ('hr', 'daily', null, 'HR', 'Policy Points DUT4',           80),
  ('hr', 'daily', null, 'HR', 'Policy Points DUT7',           90),
  ('hr', 'daily', null, 'HR', 'Schedule',                    100);

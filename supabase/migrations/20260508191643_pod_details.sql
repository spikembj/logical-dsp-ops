-- =============================================================================
-- Step 6.5 wave 4: pod_details table.
--
-- One row per driver per week with the Photo-On-Delivery acceptance breakdown:
-- 4 totals (opportunities, success, bypass, rejects) plus 9 reject-reason
-- counts. Source is the Amazon "POD Details" PDF; the per-package detail
-- on which photos were rejected and why.
-- =============================================================================

create table if not exists public.pod_details (
  id                              uuid primary key default gen_random_uuid(),
  driver_id                       uuid not null references public.drivers(id) on delete restrict,
  week_ending                     date not null,

  -- POD Summary totals
  opportunities                   integer not null default 0,
  success                         integer not null default 0,
  bypass                          integer not null default 0,
  rejects                         integer not null default 0,

  -- Reject reason breakdown (per Amazon's 9 categories)
  blurry_photo                    integer not null default 0,
  package_in_car                  integer not null default 0,
  package_in_hand                 integer not null default 0,
  package_too_close               integer not null default 0,
  photo_too_dark                  integer not null default 0,
  human_in_picture                integer not null default 0,
  package_not_clearly_visible     integer not null default 0,
  no_package_detected             integer not null default 0,
  other_reject                    integer not null default 0,

  raw_data                        jsonb,
  imported_from                   uuid references public.file_imports(id),
  created_at                      timestamptz not null default now()
);

create unique index if not exists pod_details_natural_key
  on public.pod_details(driver_id, week_ending);

create index if not exists pod_details_week_idx
  on public.pod_details(week_ending desc);

create index if not exists pod_details_rejects_idx
  on public.pod_details(driver_id) where rejects > 0;

alter table public.pod_details enable row level security;

create policy pod_details_select on public.pod_details
  for select using (public.is_active_user());

create policy pod_details_insert on public.pod_details
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

create policy pod_details_update on public.pod_details
  for update
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy pod_details_delete on public.pod_details
  for delete
  using (public.current_user_role() in ('admin', 'manager'));

-- =============================================================================
-- Step 6.5 wave 3b: CDF Negative table.
--
-- One row per individual negative Customer Delivery Feedback. Customer
-- comment + flag columns showing what the complaint was (mishandled,
-- unprofessional, wrong address, etc.). Each row corresponds to one
-- delivery (one tracking ID) where the customer left negative feedback.
--
-- Per-driver coaching value: drivers with multiple CDF negatives in a
-- short period need targeted coaching. The CDF DPMO column on the
-- weekly scorecard is the rate version of this data.
-- =============================================================================

create table if not exists public.cdf_negative (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete restrict,
  tracking_id         text not null,
  delivery_group_id   text,
  delivery_date       timestamptz not null,
  feedback_details    text,
  feedback_types      text[] not null default '{}',
  raw_data            jsonb,
  imported_from       uuid references public.file_imports(id),
  notes               text,
  created_at          timestamptz not null default now()
);

create unique index if not exists cdf_negative_natural_key
  on public.cdf_negative(driver_id, tracking_id);

create index if not exists cdf_negative_driver_date_idx
  on public.cdf_negative(driver_id, delivery_date desc);

alter table public.cdf_negative enable row level security;

create policy cdf_negative_select on public.cdf_negative
  for select using (public.is_active_user());

create policy cdf_negative_insert on public.cdf_negative
  for insert
  with check (public.current_user_role() in ('admin', 'manager'));

create policy cdf_negative_update on public.cdf_negative
  for update
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy cdf_negative_delete on public.cdf_negative
  for delete
  using (public.current_user_role() in ('admin', 'manager'));

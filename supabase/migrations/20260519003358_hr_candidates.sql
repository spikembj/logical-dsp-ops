-- =============================================================================
-- HR Phase 3 — Pass C: candidates module
--
-- Four tables:
--
--   candidate_statuses  — HR-editable list of pipeline buckets, with a
--                         color (one of 12 tailwind palettes), a sort
--                         order, an active flag, and a treat_as_declined
--                         flag that drives the previously-declined warning
--                         on the Add Candidate form.
--
--   candidates          — one row per application. Each new attempt
--                         creates a new row (user has high turnover, and
--                         we want history per attempt for the dedup
--                         flag). phone_digits is the normalized lookup
--                         key (10 digits, no formatting); phone_display
--                         is what HR typed. A trigger keeps them in
--                         sync any time phone_display changes.
--
--   candidate_onboarding_template_items  — HR-managed checklist of
--                         paperwork (I-9, W-4, drug test, etc.).
--
--   candidate_onboarding_completion      — per-candidate per-item.
--                         Same shape as duties_completion.
--
-- Plus: drivers.candidate_id FK so a converted candidate's pre-hire
-- history is one click away from the driver detail page.
--
-- All four candidate tables are management-only via RLS — dispatchers
-- never see them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- candidate_statuses
-- -----------------------------------------------------------------------------
create table public.candidate_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'slate'
    check (color in (
      'slate','sky','blue','indigo','purple','pink','rose','red',
      'orange','amber','emerald','teal'
    )),
  sort_order int not null default 100,
  treat_as_declined boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidate_statuses_sort_idx
  on public.candidate_statuses (active desc, sort_order, name);

create trigger candidate_statuses_set_updated_at
  before update on public.candidate_statuses
  for each row execute function public.set_updated_at();

alter table public.candidate_statuses enable row level security;

create policy candidate_statuses_select on public.candidate_statuses
  for select using (public.is_management());
create policy candidate_statuses_write on public.candidate_statuses
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete on public.candidate_statuses to authenticated;

-- -----------------------------------------------------------------------------
-- candidates
-- -----------------------------------------------------------------------------
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.candidate_statuses(id)
    on delete restrict,
  full_name text not null,
  phone_digits text,
  phone_display text,
  email text,
  interview_dt timestamptz,
  interview_dsp text,
  source text,
  notes text,
  archived_at timestamptz,
  converted_driver_id uuid references public.drivers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index candidates_phone_idx
  on public.candidates (phone_digits)
  where phone_digits is not null;

create index candidates_status_archived_idx
  on public.candidates (status_id, archived_at);

create index candidates_archived_idx
  on public.candidates (archived_at desc nulls last);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  -- strip everything that is not a digit; collapse empty to null.
  -- Country-code 1 is stripped if the result is 11 digits starting with 1.
  select case
    when p is null then null
    else
      case
        when length(regexp_replace(p, '[^0-9]', '', 'g')) = 11
         and left(regexp_replace(p, '[^0-9]', '', 'g'), 1) = '1'
          then right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
        else nullif(regexp_replace(p, '[^0-9]', '', 'g'), '')
      end
  end;
$$;

create or replace function public.candidates_sync_phone()
returns trigger language plpgsql as $$
begin
  new.phone_digits := public.normalize_phone(new.phone_display);
  return new;
end$$;

create trigger candidates_phone_sync
  before insert or update of phone_display on public.candidates
  for each row execute function public.candidates_sync_phone();

alter table public.candidates enable row level security;

create policy candidates_select on public.candidates
  for select using (public.is_management());
create policy candidates_write on public.candidates
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete on public.candidates to authenticated;

-- -----------------------------------------------------------------------------
-- onboarding checklist (template + completion)
-- -----------------------------------------------------------------------------
create table public.candidate_onboarding_template_items (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidate_onboarding_template_items_sort_idx
  on public.candidate_onboarding_template_items
  (active desc, sort_order, id);

create trigger candidate_onboarding_template_items_set_updated_at
  before update on public.candidate_onboarding_template_items
  for each row execute function public.set_updated_at();

alter table public.candidate_onboarding_template_items enable row level security;

create policy candidate_onboarding_template_items_select
  on public.candidate_onboarding_template_items
  for select using (public.is_management());
create policy candidate_onboarding_template_items_write
  on public.candidate_onboarding_template_items
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.candidate_onboarding_template_items to authenticated;

create table public.candidate_onboarding_completion (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  template_item_id uuid not null
    references public.candidate_onboarding_template_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.users(id) on delete set null,
  unique (candidate_id, template_item_id)
);

create index candidate_onboarding_completion_candidate_idx
  on public.candidate_onboarding_completion (candidate_id);

alter table public.candidate_onboarding_completion enable row level security;

create policy candidate_onboarding_completion_select
  on public.candidate_onboarding_completion
  for select using (public.is_management());
create policy candidate_onboarding_completion_write
  on public.candidate_onboarding_completion
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.candidate_onboarding_completion to authenticated;

-- -----------------------------------------------------------------------------
-- drivers.candidate_id — link converted driver back to their application
-- -----------------------------------------------------------------------------
alter table public.drivers
  add column candidate_id uuid references public.candidates(id) on delete set null;

create index drivers_candidate_id_idx on public.drivers (candidate_id)
  where candidate_id is not null;

comment on column public.drivers.candidate_id is
  'When a candidate was Converted to driver from /hr/candidates, this is their candidate row. Lets HR click into pre-hire history (interview notes, onboarding paperwork) from the driver detail page.';

-- -----------------------------------------------------------------------------
-- Seed — 9 statuses lifted from the dispatcher's existing spreadsheet
-- buckets plus ONBOARDING.
-- -----------------------------------------------------------------------------
insert into public.candidate_statuses
  (name, color, sort_order, treat_as_declined) values
  ('TO CHECK IN ON',        'purple',  10, false),
  ('WAITING ON RESPONSE',   'pink',    20, false),
  ('NO SHOW FOR INTERVIEW', 'amber',   30, true),
  ('DUT4 INTERVIEWS',       'teal',    40, false),
  ('DUT7 INTERVIEWS',       'red',     50, false),
  ('TO THINK ABOUT',        'rose',    60, false),
  ('DONT HIRE',             'slate',   70, true),
  ('TO HIRE',               'blue',    80, false),
  ('ONBOARDING',            'emerald', 90, false);

insert into public.candidate_onboarding_template_items
  (description, sort_order) values
  ('I-9 completed',              10),
  ('W-4 completed',              20),
  ('Drug test scheduled',        30),
  ('Drug test passed',           40),
  ('Background check submitted', 50),
  ('Background check cleared',   60),
  ('Direct deposit set up',      70),
  ('Trainer assigned',           80),
  ('Start date confirmed',       90),
  ('Uniform issued',            100);

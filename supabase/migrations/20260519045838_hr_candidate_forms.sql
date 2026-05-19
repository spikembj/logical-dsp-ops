-- =============================================================================
-- HR Phase 3 — Pass E: candidate-facing forms with per-candidate QR tokens
--
-- Four tables:
--   candidate_forms              — HR-managed form definitions
--   candidate_form_questions     — questions per form
--   candidate_form_invitations   — per (candidate, form), token, timestamps
--   candidate_form_answers       — per (invitation, question)
--
-- Two seed forms: 'interviewee' and 'onboarding'. HR can add more form
-- types later — slug-driven, no code change required.
--
-- The interviewee submits via /forms/<token> WITHOUT logging in.
-- Server actions use the service-role client to bypass RLS for that
-- flow; RLS itself is locked to management for safety.
-- =============================================================================

create table public.candidate_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidate_forms_sort_idx
  on public.candidate_forms (active desc, sort_order, name);

create trigger candidate_forms_set_updated_at
  before update on public.candidate_forms
  for each row execute function public.set_updated_at();

alter table public.candidate_forms enable row level security;

create policy candidate_forms_select on public.candidate_forms
  for select using (public.is_management());
create policy candidate_forms_write on public.candidate_forms
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete on public.candidate_forms to authenticated;

create table public.candidate_form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.candidate_forms(id) on delete cascade,
  prompt text not null,
  response_type text not null check (response_type in ('yn', 'text')),
  sort_order int not null default 100,
  active boolean not null default true,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidate_form_questions_form_idx
  on public.candidate_form_questions (form_id, active desc, sort_order, id);

create trigger candidate_form_questions_set_updated_at
  before update on public.candidate_form_questions
  for each row execute function public.set_updated_at();

alter table public.candidate_form_questions enable row level security;

create policy candidate_form_questions_select on public.candidate_form_questions
  for select using (public.is_management());
create policy candidate_form_questions_write on public.candidate_form_questions
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.candidate_form_questions to authenticated;

create table public.candidate_form_invitations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  form_id uuid not null references public.candidate_forms(id) on delete cascade,
  token text not null unique,
  sent_at timestamptz not null default now(),
  submitted_at timestamptz,
  submitted_ip text,
  submitted_user_agent text,
  created_at timestamptz not null default now(),
  unique (candidate_id, form_id)
);

create index candidate_form_invitations_token_idx
  on public.candidate_form_invitations (token);

create index candidate_form_invitations_candidate_idx
  on public.candidate_form_invitations (candidate_id, form_id);

alter table public.candidate_form_invitations enable row level security;

create policy candidate_form_invitations_select on public.candidate_form_invitations
  for select using (public.is_management());
create policy candidate_form_invitations_write on public.candidate_form_invitations
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.candidate_form_invitations to authenticated;

create table public.candidate_form_answers (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.candidate_form_invitations(id) on delete cascade,
  question_id uuid not null
    references public.candidate_form_questions(id) on delete cascade,
  value_text text,
  value_bool boolean,
  unique (invitation_id, question_id)
);

create index candidate_form_answers_invitation_idx
  on public.candidate_form_answers (invitation_id);

alter table public.candidate_form_answers enable row level security;

create policy candidate_form_answers_select on public.candidate_form_answers
  for select using (public.is_management());
create policy candidate_form_answers_write on public.candidate_form_answers
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.candidate_form_answers to authenticated;

-- -----------------------------------------------------------------------------
-- Seed: two forms from the user-provided screenshots
-- -----------------------------------------------------------------------------
with form as (
  insert into public.candidate_forms (slug, name, description, sort_order)
  values ('interviewee',
          'Interviewee form',
          'QR code given to the candidate before / during their interview.',
          10)
  returning id
)
insert into public.candidate_form_questions
  (form_id, prompt, response_type, sort_order)
select id, q.prompt, q.response_type, q.sort_order
from form, (values
  ('If Billie/Curtis did not reach out to you, please put your phone number here', 'text',  10),
  ('If you could pick your schedule, what would it look like?',                    'text',  20),
  ('Any injuries that prevent getting in / out of a vehicle 200+ times a day?',    'yn',    30),
  ('Are you able to lift 50lbs?',                                                  'yn',    40),
  ('Do you have reliable transportation to and from work?',                        'yn',    50),
  ('Are you comfortable using a mobile phone for work tasks?',                     'yn',    60),
  ('Any scheduling conflicts we should know about?',                               'text',  70),
  ('What would you do if a customer was upset about their delivery?',              'text',  80),
  ('If you were running late, how would you communicate that?',                    'text',  90),
  ('Have you worked in dispatch, delivery, or logistics before?',                  'yn',   100),
  ('If yes and it was another DSP, what DSP was it?',                              'text', 110),
  ('What does "doing a good job" mean to you?',                                    'text', 120),
  ('Is there a question you wish was asked?',                                      'text', 130),
  ('What was the name of the person that interviewed you?',                        'text', 140),
  ('Did they walk you around the warehouse?',                                      'yn',   150),
  ('Were you able to lift a tote to see how heavy it is?',                         'yn',   160),
  ('Did the person interviewing you answer any questions you had?',                'yn',   170),
  ('Comments / suggestions that would have made your interview better?',           'text', 180)
) as q(prompt, response_type, sort_order);

with form as (
  insert into public.candidate_forms (slug, name, description, sort_order)
  values ('onboarding',
          'Onboarding form',
          'Sent by HR after a candidate enters onboarding. Captures the basics HR needs for paperwork.',
          20)
  returning id
)
insert into public.candidate_form_questions
  (form_id, prompt, response_type, sort_order)
select id, q.prompt, q.response_type, q.sort_order
from form, (values
  ('Email address',                                                                'text', 10),
  ('Full name (including middle name if applicable)',                              'text', 20),
  ('Address — street, city, state, zip, county',                                   'text', 30),
  ('Emergency contact (name + phone)',                                             'text', 40),
  ('Birthdate (MM/DD/YYYY)',                                                       'text', 50),
  ('If not performing well, how are you best encouraged / motivated to do better?', 'text', 60),
  ('Ideal work schedule (include one weekend day)',                                'text', 70),
  ('Driver license ID number',                                                     'text', 80),
  ('Driver license issuance state',                                                'text', 90),
  ('Driver license expiration date',                                               'text', 100),
  ('Any allergies, do you use an inhaler, anything else health-related we should know?', 'text', 110)
) as q(prompt, response_type, sort_order);

-- Note: Social Security Number is intentionally NOT seeded. Capturing
-- SSN through a token-only public URL has real PII risk. HR can add
-- the question via /hr/candidates/forms if they decide they want it.

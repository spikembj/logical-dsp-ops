-- =============================================================================
-- HR Phase 3 — Pass D: dispatcher interview view in /daily
--
-- Three tables (questions template / responses / answers) + an RPC
-- that lets dispatchers narrow-scope update candidate.status_id
-- without exposing other candidate columns to writes.
--
-- RLS-wise:
--   - dispatcher_interview_questions: read = is_operations(), write = mgmt
--   - dispatcher_interview_responses + answers: read/write = is_operations()
--   - candidate_statuses_select relaxed to is_operations() so dispatchers
--     can show the status chip on the interview form
--   - new candidates_select_for_dispatchers policy: dispatchers can read
--     candidates with interview_dt in ±7d AND not archived. Management
--     already has unrestricted read via the original policy.
--   - dispatcher_change_candidate_status() RPC handles the narrow
--     status-only update (RLS UPDATE cannot restrict columns; the RPC can)
-- =============================================================================

create table public.dispatcher_interview_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  response_type text not null check (response_type in ('yn', 'text')),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dispatcher_interview_questions_sort_idx
  on public.dispatcher_interview_questions (active desc, sort_order, id);

create trigger dispatcher_interview_questions_set_updated_at
  before update on public.dispatcher_interview_questions
  for each row execute function public.set_updated_at();

alter table public.dispatcher_interview_questions enable row level security;

create policy dispatcher_interview_questions_select
  on public.dispatcher_interview_questions
  for select using (public.is_operations());

create policy dispatcher_interview_questions_write
  on public.dispatcher_interview_questions
  for all using (public.is_management()) with check (public.is_management());

grant select, insert, update, delete
  on public.dispatcher_interview_questions to authenticated;

create table public.dispatcher_interview_responses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique
    references public.candidates(id) on delete cascade,
  conducted_by uuid references public.users(id) on delete set null,
  conducted_at timestamptz not null default now(),
  overall_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dispatcher_interview_responses_candidate_idx
  on public.dispatcher_interview_responses (candidate_id);

create trigger dispatcher_interview_responses_set_updated_at
  before update on public.dispatcher_interview_responses
  for each row execute function public.set_updated_at();

alter table public.dispatcher_interview_responses enable row level security;

create policy dispatcher_interview_responses_select
  on public.dispatcher_interview_responses
  for select using (public.is_operations());

create policy dispatcher_interview_responses_write
  on public.dispatcher_interview_responses
  for all using (public.is_operations()) with check (public.is_operations());

grant select, insert, update, delete
  on public.dispatcher_interview_responses to authenticated;

create table public.dispatcher_interview_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null
    references public.dispatcher_interview_responses(id) on delete cascade,
  question_id uuid not null
    references public.dispatcher_interview_questions(id) on delete cascade,
  value_text text,
  value_bool boolean,
  unique (response_id, question_id)
);

create index dispatcher_interview_answers_response_idx
  on public.dispatcher_interview_answers (response_id);

alter table public.dispatcher_interview_answers enable row level security;

create policy dispatcher_interview_answers_select
  on public.dispatcher_interview_answers
  for select using (public.is_operations());

create policy dispatcher_interview_answers_write
  on public.dispatcher_interview_answers
  for all using (public.is_operations()) with check (public.is_operations());

grant select, insert, update, delete
  on public.dispatcher_interview_answers to authenticated;

drop policy candidate_statuses_select on public.candidate_statuses;
create policy candidate_statuses_select on public.candidate_statuses
  for select using (public.is_operations());

create policy candidates_select_for_dispatchers on public.candidates
  for select using (
    public.is_operations()
    and not public.is_management()
    and interview_dt is not null
    and interview_dt >= (now() - interval '7 days')
    and interview_dt <= (now() + interval '7 days')
    and archived_at is null
  );

create or replace function public.dispatcher_change_candidate_status(
  p_candidate_id uuid,
  p_status_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_candidate record;
  v_role text;
begin
  select public.current_user_role() into v_role;
  if v_role not in ('owner','hr','ops_manager','admin','manager','dispatcher') then
    raise exception 'Not authorized';
  end if;

  select id, interview_dt, archived_at
    into v_candidate
    from public.candidates
    where id = p_candidate_id;
  if not found then raise exception 'Candidate not found'; end if;
  if v_candidate.archived_at is not null then
    raise exception 'Candidate is archived'; end if;
  if v_role = 'dispatcher' then
    if v_candidate.interview_dt is null
       or v_candidate.interview_dt <  (now() - interval '7 days')
       or v_candidate.interview_dt >  (now() + interval '7 days') then
      raise exception 'Candidate is outside the interview window';
    end if;
  end if;
  if not exists (select 1 from public.candidate_statuses where id = p_status_id) then
    raise exception 'Status not found';
  end if;

  update public.candidates
    set status_id = p_status_id,
        updated_at = now()
    where id = p_candidate_id;
end$$;

grant execute on function
  public.dispatcher_change_candidate_status(uuid, uuid)
  to authenticated;

insert into public.dispatcher_interview_questions
  (prompt, response_type, sort_order) values
  ('Reliable transportation to and from work?',                  'yn',   10),
  ('Comfortable using a mobile phone for work tasks?',           'yn',   20),
  ('Able to lift 50lbs?',                                        'yn',   30),
  ('No injuries preventing in/out of vehicle 200+ times/day?',   'yn',   40),
  ('No scheduling conflicts to flag?',                           'yn',   50),
  ('Has prior dispatch / delivery / logistics experience?',      'yn',   60),
  ('Clear plan for communicating when running late?',            'yn',   70),
  ('Solid answer on handling an upset customer?',                'yn',   80),
  ('Walked them around the warehouse?',                          'yn',   90),
  ('Showed them a tote so they could feel the weight?',          'yn',  100),
  ('Answered all their questions?',                              'yn',  110),
  ('Overall fit — would you hire them?',                         'yn',  120),
  ('Notes on prior DSP experience (if any)',                     'text', 200),
  ('What "doing a good job" means to them',                      'text', 210),
  ('Their ideal work schedule',                                  'text', 220),
  ('Any other comments / red flags',                             'text', 230);

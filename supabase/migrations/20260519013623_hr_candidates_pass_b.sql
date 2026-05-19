-- =============================================================================
-- HR Phase 3 — Pass C.B: candidate detail / onboarding / convert
--
--   1. candidate_statuses.is_onboarding — per-status flag controlling
--      whether the onboarding checklist surfaces on the detail page.
--      Seeded TRUE for ONBOARDING; HR can flip it on any custom status
--      ("EXTENDED ONBOARDING", "BACKGROUND PENDING") without a code
--      change.
--
--   2. convert_candidate_to_driver(...) — atomic RPC that:
--        - refuses if any active onboarding item is unchecked
--        - refuses if the candidate is already converted or archived
--        - inserts the drivers row (full_name copied + candidate_id FK)
--        - archives the candidate row + writes converted_driver_id
--      No SECURITY DEFINER — relies on RLS so only management can run.
-- =============================================================================

alter table public.candidate_statuses
  add column is_onboarding boolean not null default false;

comment on column public.candidate_statuses.is_onboarding is
  'When true, candidates in this status see the onboarding checklist on their detail page. Lets HR optionally split onboarding across multiple sequential statuses (PAPERWORK PENDING, DRUG TEST PENDING, etc.) and have the checklist appear in each.';

update public.candidate_statuses
  set is_onboarding = true
  where name = 'ONBOARDING';

create or replace function public.convert_candidate_to_driver(
  p_candidate_id uuid,
  p_position text,
  p_hire_date date,
  p_approved_vehicle_types text[]
) returns uuid
language plpgsql as $$
declare
  v_candidate record;
  v_driver_id uuid;
  v_pending int;
begin
  select id, full_name, converted_driver_id, archived_at
    into v_candidate
    from public.candidates
    where id = p_candidate_id;
  if not found then raise exception 'Candidate not found'; end if;
  if v_candidate.converted_driver_id is not null then
    raise exception 'Already converted to a driver'; end if;
  if v_candidate.archived_at is not null then
    raise exception 'Already archived'; end if;

  select count(*) into v_pending
    from public.candidate_onboarding_template_items t
    where t.active = true
      and not exists (
        select 1 from public.candidate_onboarding_completion c
        where c.template_item_id = t.id
          and c.candidate_id = p_candidate_id
      );
  if v_pending > 0 then
    raise exception 'Onboarding checklist incomplete: % items remaining', v_pending;
  end if;

  insert into public.drivers
    (full_name, status, position, hire_date, approved_vehicle_types, candidate_id)
  values
    (v_candidate.full_name, 'active', p_position::driver_position, p_hire_date,
     p_approved_vehicle_types::vehicle_type[], p_candidate_id)
  returning id into v_driver_id;

  update public.candidates
    set converted_driver_id = v_driver_id,
        archived_at = now()
    where id = p_candidate_id;

  return v_driver_id;
end$$;

grant execute on function
  public.convert_candidate_to_driver(uuid, text, date, text[])
  to authenticated;

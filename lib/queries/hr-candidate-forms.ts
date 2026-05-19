import "server-only";
import { cache } from "react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  CandidateForm,
  CandidateFormAnswer,
  CandidateFormInvitation,
  CandidateFormQuestion,
  CandidateFormStatusRow,
  PublicFormBundle,
} from "./hr-candidate-forms-types";

/**
 * Server-only queries for the candidate-facing forms module. Types live
 * in `./hr-candidate-forms-types` so client components can import them
 * without dragging this module into the browser bundle.
 */
export * from "./hr-candidate-forms-types";

/** All forms (active + inactive), ordered for the admin UI. */
export const listCandidateForms = cache(async (): Promise<CandidateForm[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_forms")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) {
    console.error("listCandidateForms failed:", error);
    return [];
  }
  return (data as CandidateForm[]) ?? [];
});

/** A single form by slug. Used by the per-form admin page. */
export const getCandidateFormBySlug = cache(
  async (slug: string): Promise<CandidateForm | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidate_forms")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("getCandidateFormBySlug failed:", error);
      return null;
    }
    return (data as CandidateForm) ?? null;
  },
);

/** All questions for a form (active + inactive), ordered for admin UI. */
export const listFormQuestions = cache(
  async (formId: string): Promise<CandidateFormQuestion[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidate_form_questions")
      .select("*")
      .eq("form_id", formId)
      .order("sort_order")
      .order("prompt");
    if (error) {
      console.error("listFormQuestions failed:", error);
      return [];
    }
    return (data as CandidateFormQuestion[]) ?? [];
  },
);

/**
 * Per-candidate status across every active form. Used by the
 * "Candidate forms" card on `/hr/candidates/[id]`.
 *
 * Returns one row per active form, with the invitation (if any),
 * question count, and answer count. Forms with no invitation yet
 * still appear so HR can click Generate-QR.
 */
export const getCandidateFormStatuses = cache(
  async (candidateId: string): Promise<CandidateFormStatusRow[]> => {
    const supabase = await createClient();
    const [formsRes, invitationsRes, questionsRes, answersRes] =
      await Promise.all([
        supabase
          .from("candidate_forms")
          .select("*")
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("candidate_form_invitations")
          .select("*")
          .eq("candidate_id", candidateId),
        supabase
          .from("candidate_form_questions")
          .select("form_id")
          .eq("active", true),
        supabase
          .from("candidate_form_answers")
          .select("invitation_id"),
      ]);

    const forms = (formsRes.data ?? []) as CandidateForm[];
    const invitations = (invitationsRes.data ?? []) as CandidateFormInvitation[];

    const questionCountByForm = new Map<string, number>();
    for (const q of (questionsRes.data ?? []) as { form_id: string }[]) {
      questionCountByForm.set(
        q.form_id,
        (questionCountByForm.get(q.form_id) ?? 0) + 1,
      );
    }

    const answerCountByInvitation = new Map<string, number>();
    for (const a of (answersRes.data ?? []) as { invitation_id: string }[]) {
      answerCountByInvitation.set(
        a.invitation_id,
        (answerCountByInvitation.get(a.invitation_id) ?? 0) + 1,
      );
    }

    const invitationByForm = new Map<string, CandidateFormInvitation>();
    for (const inv of invitations) invitationByForm.set(inv.form_id, inv);

    return forms.map((form) => {
      const inv = invitationByForm.get(form.id) ?? null;
      return {
        form,
        invitation: inv,
        question_count: questionCountByForm.get(form.id) ?? 0,
        answer_count: inv
          ? (answerCountByInvitation.get(inv.id) ?? 0)
          : 0,
      };
    });
  },
);

/** Answers for one invitation, joined with their question prompt. */
export const getInvitationAnswers = cache(
  async (
    invitationId: string,
  ): Promise<(CandidateFormAnswer & { question: CandidateFormQuestion })[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidate_form_answers")
      .select(
        `*, question:candidate_form_questions ( * )`,
      )
      .eq("invitation_id", invitationId);
    if (error) {
      console.error("getInvitationAnswers failed:", error);
      return [];
    }
    type Joined = CandidateFormAnswer & {
      question: CandidateFormQuestion | CandidateFormQuestion[] | null;
    };
    return ((data ?? []) as unknown as Joined[])
      .map((row) => ({
        ...row,
        question:
          (Array.isArray(row.question) ? row.question[0] : row.question) ??
          ({
            id: row.question_id,
            form_id: "",
            prompt: "(deleted question)",
            response_type: "text" as const,
            sort_order: 99999,
            active: false,
            required: false,
            created_at: "",
            updated_at: "",
          } satisfies CandidateFormQuestion),
      }))
      .sort((a, b) => a.question.sort_order - b.question.sort_order);
  },
);

/**
 * Public token resolution — used by the `/forms/[token]` page.
 * Uses the service-role client so no auth is required. Returns null
 * if the token does not match an invitation.
 *
 * Bundles the candidate name, form definition, active questions, the
 * invitation row, and any answers already submitted (so edit-in-place
 * works on subsequent visits to the same URL).
 */
export async function getPublicFormByToken(
  token: string,
): Promise<PublicFormBundle | null> {
  if (!token || token.length < 8) return null;
  const supabase = createServiceRoleClient();

  const { data: inv, error: invErr } = await supabase
    .from("candidate_form_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (invErr || !inv) return null;
  const invitation = inv as CandidateFormInvitation;

  const [formRes, candidateRes, questionsRes, answersRes] = await Promise.all([
    supabase
      .from("candidate_forms")
      .select("*")
      .eq("id", invitation.form_id)
      .maybeSingle(),
    supabase
      .from("candidates")
      .select("full_name")
      .eq("id", invitation.candidate_id)
      .maybeSingle(),
    supabase
      .from("candidate_form_questions")
      .select("*")
      .eq("form_id", invitation.form_id)
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("candidate_form_answers")
      .select("*")
      .eq("invitation_id", invitation.id),
  ]);

  const form = (formRes.data as CandidateForm | null) ?? null;
  const candidate = candidateRes.data as { full_name: string } | null;
  if (!form || !candidate) return null;

  return {
    candidate_full_name: candidate.full_name,
    form,
    questions: (questionsRes.data as CandidateFormQuestion[]) ?? [],
    invitation,
    answers: (answersRes.data as CandidateFormAnswer[]) ?? [],
  };
}

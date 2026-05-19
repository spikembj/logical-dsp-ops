"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";
import { generateFormToken } from "@/lib/queries/hr-candidate-forms-types";

/**
 * Server actions for the candidate-facing forms module.
 *
 *   - Form / question / invitation CRUD: management only
 *   - Public form submission: anyone with a valid token (no auth) —
 *     uses the service-role client to bypass RLS for that one path.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

// ---------------------------------------------------------------------------
// Form definition CRUD
// ---------------------------------------------------------------------------

const UpsertFormSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or dashes"),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().default(true),
});

export async function upsertCandidateForm(
  input: z.infer<typeof UpsertFormSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpsertFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description,
    active: parsed.data.active,
  };
  if (parsed.data.sort_order !== undefined)
    payload.sort_order = parsed.data.sort_order;
  if (parsed.data.id) payload.id = parsed.data.id;

  const { error } = await supabase
    .from("candidate_forms")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A form with that slug already exists." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/hr/candidates");
  revalidatePath("/hr/candidates/forms");
  return { ok: true };
}

const DeleteFormSchema = z.object({ form_id: z.string().uuid() });

export async function deleteCandidateForm(
  input: z.infer<typeof DeleteFormSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  // ON DELETE CASCADE on questions + invitations + answers — they go too.
  const { error } = await supabase
    .from("candidate_forms")
    .delete()
    .eq("id", parsed.data.form_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hr/candidates");
  revalidatePath("/hr/candidates/forms");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Question CRUD per form
// ---------------------------------------------------------------------------

const QuestionTypeEnum = z.enum(["yn", "text"]);

const UpsertQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  form_id: z.string().uuid(),
  prompt: z.string().trim().min(1, "Prompt is required").max(500),
  response_type: QuestionTypeEnum,
  sort_order: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().default(true),
  required: z.boolean().default(false),
});

export async function upsertFormQuestion(
  input: z.infer<typeof UpsertQuestionSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpsertQuestionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    form_id: parsed.data.form_id,
    prompt: parsed.data.prompt,
    response_type: parsed.data.response_type,
    active: parsed.data.active,
    required: parsed.data.required,
  };
  if (parsed.data.sort_order !== undefined)
    payload.sort_order = parsed.data.sort_order;
  if (parsed.data.id) payload.id = parsed.data.id;

  const { error } = await supabase
    .from("candidate_form_questions")
    .upsert(payload, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hr/candidates/forms`);
  return { ok: true };
}

const ReorderQuestionsSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export async function reorderFormQuestions(
  input: z.infer<typeof ReorderQuestionsSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = ReorderQuestionsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const updates = parsed.data.ordered_ids.map((id, idx) =>
    supabase
      .from("candidate_form_questions")
      .update({ sort_order: (idx + 1) * 10 })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return { ok: false, error: firstErr.message };

  revalidatePath(`/hr/candidates/forms`);
  return { ok: true };
}

const DeleteQuestionSchema = z.object({ question_id: z.string().uuid() });

export async function deleteFormQuestion(
  input: z.infer<typeof DeleteQuestionSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteQuestionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  // ON DELETE CASCADE on candidate_form_answers — historical answers
  // to this question go with it.
  const { error } = await supabase
    .from("candidate_form_questions")
    .delete()
    .eq("id", parsed.data.question_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/hr/candidates/forms`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invitation lifecycle (management)
// ---------------------------------------------------------------------------

const EnsureInvitationSchema = z.object({
  candidate_id: z.string().uuid(),
  form_id: z.string().uuid(),
});

/**
 * Idempotent: if an invitation row already exists for the
 * (candidate, form) pair, returns its token. Otherwise creates a fresh
 * one with a new random token. Used by the "Generate link / QR" button.
 */
export async function ensureInvitation(
  input: z.infer<typeof EnsureInvitationSchema>,
): Promise<ActionResult<{ token: string }>> {
  await requireManagement();
  const parsed = EnsureInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("candidate_form_invitations")
    .select("token")
    .eq("candidate_id", parsed.data.candidate_id)
    .eq("form_id", parsed.data.form_id)
    .maybeSingle();
  if (existing) {
    return { ok: true, data: { token: (existing as { token: string }).token } };
  }

  const token = generateFormToken();
  const { error } = await supabase.from("candidate_form_invitations").insert({
    candidate_id: parsed.data.candidate_id,
    form_id: parsed.data.form_id,
    token,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hr/candidates/${parsed.data.candidate_id}`);
  return { ok: true, data: { token } };
}

const RegenerateSchema = z.object({ invitation_id: z.string().uuid() });

/**
 * Rotate the token on an existing invitation. Useful if HR worries
 * the URL leaked. Also wipes submitted_at so the new token starts
 * fresh — but answers stay (they are linked to the invitation_id,
 * not the token).
 */
export async function regenerateInvitationToken(
  input: z.infer<typeof RegenerateSchema>,
): Promise<ActionResult<{ token: string }>> {
  await requireManagement();
  const parsed = RegenerateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const token = generateFormToken();
  const { data, error } = await supabase
    .from("candidate_form_invitations")
    .update({
      token,
      submitted_at: null,
      submitted_ip: null,
      submitted_user_agent: null,
    })
    .eq("id", parsed.data.invitation_id)
    .select("candidate_id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hr/candidates/${data.candidate_id}`);
  return { ok: true, data: { token } };
}

const DeleteInvitationSchema = z.object({ invitation_id: z.string().uuid() });

export async function deleteInvitation(
  input: z.infer<typeof DeleteInvitationSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  // ON DELETE CASCADE on answers — they go too.
  const { data, error } = await supabase
    .from("candidate_form_invitations")
    .delete()
    .eq("id", parsed.data.invitation_id)
    .select("candidate_id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/hr/candidates/${data.candidate_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public submission — no auth required, token is the credential.
// ---------------------------------------------------------------------------

const PublicAnswerSchema = z.object({
  question_id: z.string().uuid(),
  value_text: z.string().max(5000).nullable().optional(),
  value_bool: z.boolean().nullable().optional(),
});

const PublicSubmitSchema = z.object({
  token: z.string().min(8).max(64),
  answers: z.array(PublicAnswerSchema),
  user_agent: z.string().max(500).nullable().optional(),
});

/**
 * Public form submission. Resolves the token via the service-role
 * client (no auth), wipes + reinserts the answer rows (edit-in-place
 * model), and stamps submitted_at on first submit.
 *
 * Repeated submissions update the answers without re-stamping
 * submitted_at — the first submit is the canonical timestamp.
 */
export async function submitPublicForm(
  input: z.infer<typeof PublicSubmitSchema>,
): Promise<ActionResult> {
  const parsed = PublicSubmitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = createServiceRoleClient();

  const { data: inv, error: invErr } = await supabase
    .from("candidate_form_invitations")
    .select("id, submitted_at, form_id")
    .eq("token", parsed.data.token)
    .maybeSingle();
  if (invErr || !inv) {
    return { ok: false, error: "This link is no longer valid." };
  }
  const invitation = inv as {
    id: string;
    submitted_at: string | null;
    form_id: string;
  };

  // Pull the question id list for this form so we silently drop
  // answers to questions that do not belong to it (defense against
  // forged payloads).
  const { data: qs } = await supabase
    .from("candidate_form_questions")
    .select("id")
    .eq("form_id", invitation.form_id);
  const validQuestionIds = new Set(
    ((qs ?? []) as { id: string }[]).map((q) => q.id),
  );

  // Replace answers.
  const { error: delErr } = await supabase
    .from("candidate_form_answers")
    .delete()
    .eq("invitation_id", invitation.id);
  if (delErr) return { ok: false, error: delErr.message };

  const validAnswers = parsed.data.answers.filter((a) =>
    validQuestionIds.has(a.question_id),
  );
  if (validAnswers.length > 0) {
    const rows = validAnswers.map((a) => ({
      invitation_id: invitation.id,
      question_id: a.question_id,
      value_text: a.value_text ?? null,
      value_bool: a.value_bool ?? null,
    }));
    const { error: insErr } = await supabase
      .from("candidate_form_answers")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  // First submit stamps the timestamp; later edits do not push it.
  if (!invitation.submitted_at) {
    await supabase
      .from("candidate_form_invitations")
      .update({
        submitted_at: new Date().toISOString(),
        submitted_user_agent: parsed.data.user_agent ?? null,
      })
      .eq("id", invitation.id);
  }

  return { ok: true };
}

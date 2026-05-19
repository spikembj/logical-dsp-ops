"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireManagement, requireRole } from "@/lib/auth/require-role";

/**
 * Server actions for the dispatcher interview module.
 *
 *   - Template CRUD: management only
 *   - Response save + status change: any operations user (dispatcher+)
 *
 * Status changes from the dispatcher form go through the
 * `dispatcher_change_candidate_status` Postgres RPC so dispatchers
 * cannot accidentally write to other candidate columns (RLS UPDATE
 * cannot restrict columns; an RPC can).
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

// ---------------------------------------------------------------------------
// Question template — management only
// ---------------------------------------------------------------------------

const QuestionTypeEnum = z.enum(["yn", "text"]);

const UpsertQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  prompt: z.string().trim().min(1, "Prompt is required").max(500),
  response_type: QuestionTypeEnum,
  sort_order: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().default(true),
});

export async function upsertInterviewQuestion(
  input: z.infer<typeof UpsertQuestionSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpsertQuestionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    prompt: parsed.data.prompt,
    response_type: parsed.data.response_type,
    active: parsed.data.active,
  };
  if (parsed.data.sort_order !== undefined)
    payload.sort_order = parsed.data.sort_order;
  if (parsed.data.id) payload.id = parsed.data.id;

  const { error } = await supabase
    .from("dispatcher_interview_questions")
    .upsert(payload, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr/candidates/interview-questions");
  return { ok: true };
}

const ReorderQuestionsSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export async function reorderInterviewQuestions(
  input: z.infer<typeof ReorderQuestionsSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = ReorderQuestionsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const updates = parsed.data.ordered_ids.map((id, idx) =>
    supabase
      .from("dispatcher_interview_questions")
      .update({ sort_order: (idx + 1) * 10 })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return { ok: false, error: firstErr.message };

  revalidatePath("/hr/candidates/interview-questions");
  return { ok: true };
}

const DeleteQuestionSchema = z.object({ question_id: z.string().uuid() });

export async function deleteInterviewQuestion(
  input: z.infer<typeof DeleteQuestionSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteQuestionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  // ON DELETE CASCADE on dispatcher_interview_answers — historical
  // answers to this question go with it.
  const supabase = await createClient();
  const { error } = await supabase
    .from("dispatcher_interview_questions")
    .delete()
    .eq("id", parsed.data.question_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr/candidates/interview-questions");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Response save — operations (dispatcher + management)
// ---------------------------------------------------------------------------

const AnswerSchema = z.object({
  question_id: z.string().uuid(),
  value_text: z.string().max(5000).nullable().optional(),
  value_bool: z.boolean().nullable().optional(),
});

const SaveResponseSchema = z.object({
  candidate_id: z.string().uuid(),
  conducted_by: z.string().uuid().nullable().optional(),
  overall_notes: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  answers: z.array(AnswerSchema),
});

export async function saveInterviewResponse(
  input: z.infer<typeof SaveResponseSchema>,
): Promise<ActionResult> {
  await requireRole([
    "owner",
    "hr",
    "ops_manager",
    "dispatcher",
    "admin",
    "manager",
  ]);
  const parsed = SaveResponseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Upsert the response row first (unique on candidate_id makes it a
  // clean edit-in-place).
  const { data: responseRow, error: respErr } = await supabase
    .from("dispatcher_interview_responses")
    .upsert(
      {
        candidate_id: parsed.data.candidate_id,
        conducted_by: parsed.data.conducted_by ?? user?.id ?? null,
        conducted_at: new Date().toISOString(),
        overall_notes: parsed.data.overall_notes,
      },
      { onConflict: "candidate_id" },
    )
    .select("id")
    .single();
  if (respErr) return { ok: false, error: respErr.message };

  // Replace answer rows. Easier than diffing — we have at most ~20
  // rows per response and the unique constraint protects us from
  // duplicates within a single submit anyway.
  const responseId = responseRow.id;
  const { error: delErr } = await supabase
    .from("dispatcher_interview_answers")
    .delete()
    .eq("response_id", responseId);
  if (delErr) return { ok: false, error: delErr.message };

  if (parsed.data.answers.length > 0) {
    const rows = parsed.data.answers.map((a) => ({
      response_id: responseId,
      question_id: a.question_id,
      value_text: a.value_text ?? null,
      value_bool: a.value_bool ?? null,
    }));
    const { error: insErr } = await supabase
      .from("dispatcher_interview_answers")
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/daily");
  revalidatePath(`/daily/interviews/${parsed.data.candidate_id}`);
  revalidatePath(`/hr/candidates/${parsed.data.candidate_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Status change from the dispatcher form — narrow RPC so dispatchers
// can only change status_id (RLS UPDATE can't restrict columns).
// ---------------------------------------------------------------------------

const DispatcherChangeStatusSchema = z.object({
  candidate_id: z.string().uuid(),
  status_id: z.string().uuid(),
});

export async function dispatcherChangeCandidateStatus(
  input: z.infer<typeof DispatcherChangeStatusSchema>,
): Promise<ActionResult> {
  await requireRole([
    "owner",
    "hr",
    "ops_manager",
    "dispatcher",
    "admin",
    "manager",
  ]);
  const parsed = DispatcherChangeStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "dispatcher_change_candidate_status",
    {
      p_candidate_id: parsed.data.candidate_id,
      p_status_id: parsed.data.status_id,
    },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/daily");
  revalidatePath(`/daily/interviews/${parsed.data.candidate_id}`);
  revalidatePath(`/hr/candidates/${parsed.data.candidate_id}`);
  revalidatePath("/hr/candidates");
  return { ok: true };
}

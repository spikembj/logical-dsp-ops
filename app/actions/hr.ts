"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";

/**
 * Server actions for the HR module.
 *
 * Permission summary:
 *   markCoachingReviewed   — management only (RLS enforces; guard here is UX layer)
 *   unmarkCoachingReviewed — management only
 *   updateReviewNotes      — management only
 *
 * Trainings + discussions cannot be marked reviewed — they never appear
 * in the HR queue and the DB partial index excludes them. The guard
 * here returns a friendly error instead of leaving an invalid row.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

const NullableNotes = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

const MarkSchema = z.object({
  session_id: z.string().uuid(),
  notes: NullableNotes,
});

export async function markCoachingReviewed(
  input: z.infer<typeof MarkSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = MarkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read session_type so we can refuse to stamp a discussion or training —
  // those should never enter the review queue.
  const { data: row, error: readErr } = await supabase
    .from("coaching_sessions")
    .select("session_type")
    .eq("id", parsed.data.session_id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Session not found." };
  if (row.session_type === "discussion" || row.session_type === "training") {
    return {
      ok: false,
      error: "Discussions and trainings do not require HR review.",
    };
  }

  const { error } = await supabase
    .from("coaching_sessions")
    .update({
      hr_reviewed_at: new Date().toISOString(),
      hr_reviewed_by: user?.id ?? null,
      hr_review_notes: parsed.data.notes,
    })
    .eq("id", parsed.data.session_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr");
  revalidatePath("/drivers");
  return { ok: true };
}

const UnmarkSchema = z.object({ session_id: z.string().uuid() });

export async function unmarkCoachingReviewed(
  input: z.infer<typeof UnmarkSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UnmarkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("coaching_sessions")
    .update({
      hr_reviewed_at: null,
      hr_reviewed_by: null,
      // Notes intentionally preserved — undoing the review does not throw
      // away HR's text. They can edit it before re-stamping if needed.
    })
    .eq("id", parsed.data.session_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr");
  revalidatePath("/drivers");
  return { ok: true };
}

const UpdateNotesSchema = z.object({
  session_id: z.string().uuid(),
  notes: NullableNotes,
});

export async function updateReviewNotes(
  input: z.infer<typeof UpdateNotesSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpdateNotesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("coaching_sessions")
    .update({ hr_review_notes: parsed.data.notes })
    .eq("id", parsed.data.session_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr");
  return { ok: true };
}

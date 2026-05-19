"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";
import {
  CANDIDATE_STATUS_COLORS,
  normalizePhoneClient,
} from "@/lib/queries/hr-candidates-types";

/**
 * Server actions for the HR candidates module — candidate CRUD plus
 * candidate_statuses CRUD. Management-only across the board (RLS is
 * the safety net; requireManagement here is the UX layer).
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

const NullableTrim = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

// ---------------------------------------------------------------------------
// Candidate CRUD
// ---------------------------------------------------------------------------

const UpsertCandidateSchema = z.object({
  id: z.string().uuid().optional(),
  status_id: z.string().uuid(),
  full_name: z.string().trim().min(1, "Name is required").max(120),
  phone_display: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  email: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  /** ISO datetime — `YYYY-MM-DDTHH:MM` from a datetime-local input. */
  interview_dt: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  interview_dsp: NullableTrim,
  source: NullableTrim,
  notes: NullableTrim,
});

export async function upsertCandidate(
  input: z.infer<typeof UpsertCandidateSchema>,
): Promise<ActionResult<{ id: string }>> {
  await requireManagement();
  const parsed = UpsertCandidateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The DB trigger will derive phone_digits from phone_display, so we
  // do not need to send it. Sending undefined keeps the existing value
  // on update if the field was not provided.
  const payload: Record<string, unknown> = {
    status_id: parsed.data.status_id,
    full_name: parsed.data.full_name,
    phone_display: parsed.data.phone_display,
    email: parsed.data.email,
    interview_dt: parsed.data.interview_dt,
    interview_dsp: parsed.data.interview_dsp,
    source: parsed.data.source,
    notes: parsed.data.notes,
    updated_by: user?.id ?? null,
  };
  if (parsed.data.id) payload.id = parsed.data.id;
  else payload.created_by = user?.id ?? null;

  const { data, error } = await supabase
    .from("candidates")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr");
  revalidatePath("/hr/candidates");
  return { ok: true, data: { id: data.id } };
}

const ChangeStatusSchema = z.object({
  candidate_id: z.string().uuid(),
  status_id: z.string().uuid(),
});

export async function changeCandidateStatus(
  input: z.infer<typeof ChangeStatusSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = ChangeStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("candidates")
    .update({
      status_id: parsed.data.status_id,
      updated_by: user?.id ?? null,
    })
    .eq("id", parsed.data.candidate_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr/candidates");
  return { ok: true };
}

const DeleteCandidateSchema = z.object({ candidate_id: z.string().uuid() });

export async function deleteCandidate(
  input: z.infer<typeof DeleteCandidateSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteCandidateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .delete()
    .eq("id", parsed.data.candidate_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hr/candidates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Candidate status CRUD (HR-editable list)
// ---------------------------------------------------------------------------

const UpsertStatusSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.enum(CANDIDATE_STATUS_COLORS),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  treat_as_declined: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function upsertCandidateStatus(
  input: z.infer<typeof UpsertStatusSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpsertStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    name: parsed.data.name,
    color: parsed.data.color,
    treat_as_declined: parsed.data.treat_as_declined,
    active: parsed.data.active,
  };
  if (parsed.data.sort_order !== undefined)
    payload.sort_order = parsed.data.sort_order;
  if (parsed.data.id) payload.id = parsed.data.id;

  const { error } = await supabase
    .from("candidate_statuses")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A status with that name already exists." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/hr/candidates");
  return { ok: true };
}

const ReorderStatusesSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export async function reorderCandidateStatuses(
  input: z.infer<typeof ReorderStatusesSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = ReorderStatusesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const updates = parsed.data.ordered_ids.map((id, idx) =>
    supabase
      .from("candidate_statuses")
      .update({ sort_order: (idx + 1) * 10 })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) return { ok: false, error: firstErr.message };

  revalidatePath("/hr/candidates");
  return { ok: true };
}

const DeleteStatusSchema = z.object({ status_id: z.string().uuid() });

export async function deleteCandidateStatus(
  input: z.infer<typeof DeleteStatusSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeleteStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  // FK on candidates.status_id is ON DELETE RESTRICT — Postgres will
  // refuse if any candidate row points at this status. Surface a
  // friendly error rather than the raw FK violation.
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_statuses")
    .delete()
    .eq("id", parsed.data.status_id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error:
          "Cannot delete — candidates are in this status. Move them first or toggle Active off.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/hr/candidates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Live dedup lookup — called from the Add Candidate form as the user
// types the phone number, so the previously-declined banner appears
// before save instead of after.
// ---------------------------------------------------------------------------

export async function lookupPriorDeclinesAction(
  rawPhone: string,
): Promise<
  ActionResult<{
    matches: { id: string; full_name: string; created_at: string; status_name: string }[];
  }>
> {
  await requireManagement();
  const digits = normalizePhoneClient(rawPhone);
  if (!digits || digits.length < 10) return { ok: true, data: { matches: [] } };
  const supabase = await createClient();
  const { data: statuses } = await supabase
    .from("candidate_statuses")
    .select("id, name")
    .eq("treat_as_declined", true);
  const declinedIds = (statuses ?? []).map((s: { id: string }) => s.id);
  if (declinedIds.length === 0) return { ok: true, data: { matches: [] } };
  const { data } = await supabase
    .from("candidates")
    .select("id, full_name, created_at, status_id")
    .eq("phone_digits", digits)
    .in("status_id", declinedIds)
    .order("created_at", { ascending: false })
    .limit(5);
  const statusNameById = new Map(
    (statuses ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
  );
  const matches = ((data ?? []) as { id: string; full_name: string; created_at: string; status_id: string }[]).map(
    (r) => ({
      id: r.id,
      full_name: r.full_name,
      created_at: r.created_at,
      status_name: statusNameById.get(r.status_id) ?? "?",
    }),
  );
  return { ok: true, data: { matches } };
}

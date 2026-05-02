"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for coaching sessions.
 *
 * The DB-level trigger (log_coaching_session_revision) and RLS policies
 * are the source of truth for audit + permissions; these actions are the
 * UX layer (validation + revalidation).
 *
 * Permission summary:
 *   create     — any active user, coached_by = auth.uid()
 *   update     — admin only (RLS enforces)
 *   void       — admin only (RLS enforces)
 *   unvoid     — admin only (RLS enforces)
 *   acknowledge — any active user, via set_coaching_acknowledged RPC
 */

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const CreateSchema = z.object({
  driver_id: z.string().uuid(),
  session_date: Iso,
  topic: z.string().trim().min(1, "Topic is required").max(200),
  notes: z.string().trim().max(10_000).optional().nullable(),
  acknowledged: z.boolean().default(false),
});

const UpdateSchema = z.object({
  session_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  session_date: Iso,
  topic: z.string().trim().min(1, "Topic is required").max(200),
  notes: z.string().trim().max(10_000).optional().nullable(),
});

const VoidSchema = z.object({
  session_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

const SimpleSchema = z.object({
  session_id: z.string().uuid(),
  driver_id: z.string().uuid(),
});

const AcknowledgeSchema = SimpleSchema.extend({
  acknowledged: z.boolean(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createCoachingSession(
  input: z.infer<typeof CreateSchema>,
): Promise<ActionResult> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { driver_id, session_date, topic, notes, acknowledged } = parsed.data;

  const { error } = await supabase.from("coaching_sessions").insert({
    driver_id,
    coached_by: user.id,
    session_date,
    topic,
    notes: notes || null,
    acknowledged,
    acknowledged_at: acknowledged ? new Date().toISOString() : null,
  });

  if (error) {
    console.error("createCoachingSession failed:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/drivers/${driver_id}/coaching`);
  revalidatePath(`/drivers/${driver_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update (admin only — RLS enforces)
// ---------------------------------------------------------------------------
export async function updateCoachingSession(
  input: z.infer<typeof UpdateSchema>,
): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { session_id, driver_id, session_date, topic, notes } = parsed.data;

  const { error, count } = await supabase
    .from("coaching_sessions")
    .update({ session_date, topic, notes: notes || null }, { count: "exact" })
    .eq("id", session_id)
    .eq("driver_id", driver_id)
    .is("voided_at", null);

  if (error) {
    console.error("updateCoachingSession failed:", error);
    return { ok: false, error: error.message };
  }
  if (count === 0) {
    // Either RLS rejected (non-admin) or session is voided / not found.
    return {
      ok: false,
      error: "Could not update session (admin-only, and not voided).",
    };
  }

  revalidatePath(`/drivers/${driver_id}/coaching`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Void (admin only — RLS enforces)
// ---------------------------------------------------------------------------
export async function voidCoachingSession(
  input: z.infer<typeof VoidSchema>,
): Promise<ActionResult> {
  const parsed = VoidSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { session_id, driver_id, reason } = parsed.data;

  const { error, count } = await supabase
    .from("coaching_sessions")
    .update(
      {
        voided_at: new Date().toISOString(),
        voided_by: user.id,
        void_reason: reason,
      },
      { count: "exact" },
    )
    .eq("id", session_id)
    .eq("driver_id", driver_id)
    .is("voided_at", null);

  if (error) {
    console.error("voidCoachingSession failed:", error);
    return { ok: false, error: error.message };
  }
  if (count === 0) {
    return { ok: false, error: "Could not void session (admin-only)." };
  }

  revalidatePath(`/drivers/${driver_id}/coaching`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Unvoid (admin only — RLS enforces)
// ---------------------------------------------------------------------------
export async function unvoidCoachingSession(
  input: z.infer<typeof SimpleSchema>,
): Promise<ActionResult> {
  const parsed = SimpleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { session_id, driver_id } = parsed.data;

  const { error, count } = await supabase
    .from("coaching_sessions")
    .update(
      { voided_at: null, voided_by: null, void_reason: null },
      { count: "exact" },
    )
    .eq("id", session_id)
    .eq("driver_id", driver_id)
    .not("voided_at", "is", null);

  if (error) {
    console.error("unvoidCoachingSession failed:", error);
    return { ok: false, error: error.message };
  }
  if (count === 0) {
    return { ok: false, error: "Could not unvoid (admin-only)." };
  }

  revalidatePath(`/drivers/${driver_id}/coaching`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Acknowledge (any active user, via SECURITY DEFINER function)
// ---------------------------------------------------------------------------
export async function setCoachingAcknowledged(
  input: z.infer<typeof AcknowledgeSchema>,
): Promise<ActionResult> {
  const parsed = AcknowledgeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_coaching_acknowledged", {
    p_session_id: parsed.data.session_id,
    p_acknowledged: parsed.data.acknowledged,
  });

  if (error) {
    console.error("setCoachingAcknowledged failed:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/drivers/${parsed.data.driver_id}/coaching`);
  return { ok: true };
}

/** @deprecated Use setCoachingAcknowledged with acknowledged: true. */
export async function acknowledgeCoachingSession(
  input: z.infer<typeof SimpleSchema>,
): Promise<ActionResult> {
  return setCoachingAcknowledged({ ...input, acknowledged: true });
}

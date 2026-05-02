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
 */

const CreateSchema = z.object({
  driver_id: z.string().uuid(),
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  topic: z.string().trim().min(1, "Topic is required").max(200),
  notes: z.string().trim().max(10_000).optional().nullable(),
  acknowledged: z.boolean().default(false),
});

export type CreateCoachingSessionInput = z.infer<typeof CreateSchema>;

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCoachingSession(
  input: CreateCoachingSessionInput,
): Promise<ActionResult> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  const supabase = await createClient();

  // RLS requires coached_by = auth.uid(); fetch the user once and pass it.
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
    console.error("createCoachingSession insert failed:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/drivers/${driver_id}/coaching`);
  revalidatePath(`/drivers/${driver_id}`);
  return { ok: true };
}

const AcknowledgeSchema = z.object({
  session_id: z.string().uuid(),
  driver_id: z.string().uuid(),
});

export async function acknowledgeCoachingSession(
  input: z.infer<typeof AcknowledgeSchema>,
): Promise<ActionResult> {
  const parsed = AcknowledgeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("coaching_sessions")
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.session_id);

  if (error) {
    console.error("acknowledgeCoachingSession failed:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/drivers/${parsed.data.driver_id}/coaching`);
  return { ok: true };
}

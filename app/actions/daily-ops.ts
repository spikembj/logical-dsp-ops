"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for Daily Ops — roster CRUD + wave_times CRUD.
 *
 * Write protection: RLS on daily_roster gates on is_operations()
 * (dispatchers + management). RLS on wave_times stays is_management()
 * since wave changes affect every dispatcher's roster. The guards here
 * are belt-and-suspenders that surface friendlier error messages than
 * the raw RLS rejection.
 */

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Same shape as ActionResult but with the new row id when creating. */
export type CreateResult =
  | { ok: true; entry_id: string }
  | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

async function requireOperations(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("users")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) return { ok: false, error: "Inactive account." };
  const ops = [
    "owner",
    "hr",
    "ops_manager",
    "admin",
    "manager",
    "dispatcher",
  ];
  if (!ops.includes(profile.role))
    return { ok: false, error: "Operations only." };
  return { ok: true };
}

async function requireManagement(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("users")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) return { ok: false, error: "Inactive account." };
  const mgmt = ["owner", "hr", "ops_manager", "admin", "manager"];
  if (!mgmt.includes(profile.role))
    return { ok: false, error: "Management only." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily roster
// ---------------------------------------------------------------------------

const CreateRosterSchema = z.object({
  date: Iso,
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  wave: z.number().int().min(1).max(20),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function createRosterEntry(
  input: z.infer<typeof CreateRosterSchema>,
): Promise<CreateResult> {
  const gate = await requireOperations();
  if (!gate.ok) return gate;
  const parsed = CreateRosterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("daily_roster")
    .insert({
      date: parsed.data.date,
      driver_id: parsed.data.driver_id,
      vehicle_id: parsed.data.vehicle_id,
      wave: parsed.data.wave,
      notes: parsed.data.notes ?? null,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("driver")
          ? "That driver is already on today's roster."
          : "That van is already assigned today.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/daily");
  return { ok: true, entry_id: data.id as string };
}

const UpdateRosterSchema = z.object({
  entry_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  wave: z.number().int().min(1).max(20),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function updateRosterEntry(
  input: z.infer<typeof UpdateRosterSchema>,
): Promise<ActionResult> {
  const gate = await requireOperations();
  if (!gate.ok) return gate;
  const parsed = UpdateRosterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { entry_id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("daily_roster")
    .update({
      ...patch,
      notes: patch.notes ?? null,
      updated_by: user?.id ?? null,
    })
    .eq("id", entry_id);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("driver")
          ? "That driver is already on today's roster."
          : "That van is already assigned today.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/daily");
  return { ok: true };
}

const DeleteRosterSchema = z.object({ entry_id: z.string().uuid() });

export async function deleteRosterEntry(
  input: z.infer<typeof DeleteRosterSchema>,
): Promise<ActionResult> {
  const gate = await requireOperations();
  if (!gate.ok) return gate;
  const parsed = DeleteRosterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_roster")
    .delete()
    .eq("id", parsed.data.entry_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/daily");
  return { ok: true };
}

const CopyFromPrevSchema = z.object({ target_date: Iso });

export interface CopyFromPrevResult {
  ok: boolean;
  error?: string;
  source_date?: string;
  copied_count?: number;
  skipped_van_grounded?: number;
  skipped_driver_inactive?: number;
  skipped_conflict?: number;
}

/**
 * Seed today's roster from the most-recent prior day with assignments.
 * Skips:
 *   - rows where the van is no longer operational (grounded since)
 *   - rows where the driver is no longer active
 *   - rows that would conflict with an existing assignment on the
 *     target date (same driver or same van already rostered)
 *
 * Returns counts so the UI can summarize what landed and what was
 * dropped, with the source date for context.
 */
export async function copyFromPreviousDay(
  input: z.infer<typeof CopyFromPrevSchema>,
): Promise<CopyFromPrevResult> {
  const gate = await requireOperations();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = CopyFromPrevSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Find the most recent date with roster rows, before target_date.
  const { data: prevDateRow, error: prevDateErr } = await supabase
    .from("daily_roster")
    .select("date")
    .lt("date", parsed.data.target_date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevDateErr) return { ok: false, error: prevDateErr.message };
  const sourceDate = prevDateRow?.date as string | undefined;
  if (!sourceDate)
    return { ok: false, error: "No prior roster found to copy from." };

  // Pull the source rows + today's existing rows in parallel.
  const [sourceRes, existingRes] = await Promise.all([
    supabase
      .from("daily_roster")
      .select("driver_id, vehicle_id, wave, notes")
      .eq("date", sourceDate),
    supabase
      .from("daily_roster")
      .select("driver_id, vehicle_id")
      .eq("date", parsed.data.target_date),
  ]);
  if (sourceRes.error) return { ok: false, error: sourceRes.error.message };
  if (existingRes.error)
    return { ok: false, error: existingRes.error.message };

  const sourceRows = sourceRes.data as {
    driver_id: string;
    vehicle_id: string;
    wave: number;
    notes: string | null;
  }[];
  const existingDriverIds = new Set(
    (existingRes.data ?? []).map((r) => r.driver_id as string),
  );
  const existingVehicleIds = new Set(
    (existingRes.data ?? []).map((r) => r.vehicle_id as string),
  );

  // Check current driver active status + vehicle operational status.
  const driverIds = [...new Set(sourceRows.map((r) => r.driver_id))];
  const vehicleIds = [...new Set(sourceRows.map((r) => r.vehicle_id))];
  const [driversRes, vehiclesRes] = await Promise.all([
    supabase.from("drivers").select("id, status").in("id", driverIds),
    supabase
      .from("vehicles")
      .select("id, operational_status")
      .in("id", vehicleIds),
  ]);
  const activeDriverIds = new Set(
    ((driversRes.data ?? []) as { id: string; status: string }[])
      .filter((d) => d.status === "active")
      .map((d) => d.id),
  );
  const operationalVehicleIds = new Set(
    (
      (vehiclesRes.data ?? []) as { id: string; operational_status: string }[]
    )
      .filter((v) => v.operational_status === "operational")
      .map((v) => v.id),
  );

  let copied = 0;
  let skippedVan = 0;
  let skippedDriver = 0;
  let skippedConflict = 0;
  const toInsert: Array<{
    date: string;
    driver_id: string;
    vehicle_id: string;
    wave: number;
    notes: string | null;
    created_by: string | null;
    updated_by: string | null;
  }> = [];

  for (const r of sourceRows) {
    if (!operationalVehicleIds.has(r.vehicle_id)) {
      skippedVan++;
      continue;
    }
    if (!activeDriverIds.has(r.driver_id)) {
      skippedDriver++;
      continue;
    }
    if (
      existingDriverIds.has(r.driver_id) ||
      existingVehicleIds.has(r.vehicle_id)
    ) {
      skippedConflict++;
      continue;
    }
    toInsert.push({
      date: parsed.data.target_date,
      driver_id: r.driver_id,
      vehicle_id: r.vehicle_id,
      wave: r.wave,
      notes: r.notes,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });
  }

  if (toInsert.length > 0) {
    const { error: insErr, count } = await supabase
      .from("daily_roster")
      .insert(toInsert, { count: "exact" });
    if (insErr) return { ok: false, error: insErr.message };
    copied = count ?? toInsert.length;
  }

  revalidatePath("/daily");
  return {
    ok: true,
    source_date: sourceDate,
    copied_count: copied,
    skipped_van_grounded: skippedVan,
    skipped_driver_inactive: skippedDriver,
    skipped_conflict: skippedConflict,
  };
}

// ---------------------------------------------------------------------------
// Wave times (management only)
// ---------------------------------------------------------------------------

const TimeStr = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Time must be HH:MM");

const UpsertWaveSchema = z.object({
  wave: z.number().int().min(1).max(20),
  show_time: TimeStr,
  active: z.boolean().default(true),
});

export async function upsertWaveTime(
  input: z.infer<typeof UpsertWaveSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;
  const parsed = UpsertWaveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("wave_times")
    .upsert(
      {
        wave: parsed.data.wave,
        show_time: parsed.data.show_time,
        active: parsed.data.active,
      },
      { onConflict: "wave" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/waves");
  revalidatePath("/daily");
  return { ok: true };
}

const DeleteWaveSchema = z.object({ wave: z.number().int().min(1).max(20) });

export async function deleteWaveTime(
  input: z.infer<typeof DeleteWaveSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;
  const parsed = DeleteWaveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("wave_times")
    .delete()
    .eq("wave", parsed.data.wave);
  if (error) {
    // FK violation = wave is in use by historical roster rows.
    if (error.code === "23503") {
      return {
        ok: false,
        error:
          "This wave has historical roster rows referencing it — mark it inactive instead of deleting.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/waves");
  revalidatePath("/daily");
  return { ok: true };
}

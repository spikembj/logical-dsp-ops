"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";

/**
 * Server actions for the Fleet module — vehicles, issues, parts.
 *
 * Write protection: RLS gates everything on is_management(), so the
 * requireManagement() guards here are belt-and-suspenders / earlier
 * error messages. Dispatchers can still read.
 */

const NullableTrim = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(issues: z.ZodError["issues"]): ActionResult {
  return { ok: false, error: issues.map((i) => i.message).join(", ") };
}

// ---------------------------------------------------------------------------
// Vehicle — update local fields (shop / parking / notes)
// ---------------------------------------------------------------------------
const UpdateLocalSchema = z.object({
  vehicle_id: z.string().uuid(),
  current_shop_location: NullableTrim,
  eod_parking_location: NullableTrim,
  notes: NullableTrim,
});

export async function updateVehicleLocalFields(
  input: z.infer<typeof UpdateLocalSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpdateLocalSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { vehicle_id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("vehicles")
    .update(patch)
    .eq("id", vehicle_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vehicle — override operational status (or clear back to Amazon's value)
// ---------------------------------------------------------------------------
const OverrideStatusSchema = z.object({
  vehicle_id: z.string().uuid(),
  status: z.enum(["operational", "grounded", "ready_for_audit"]),
  note: NullableTrim,
});

export async function setVehicleStatusOverride(
  input: z.infer<typeof OverrideStatusSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = OverrideStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("vehicles")
    .update({
      operational_status: parsed.data.status,
      operational_status_source: "manual",
      operational_status_changed_at: new Date().toISOString(),
      operational_status_changed_by: user?.id ?? null,
      manual_status_note: parsed.data.note,
    })
    .eq("id", parsed.data.vehicle_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

const ClearOverrideSchema = z.object({ vehicle_id: z.string().uuid() });

/**
 * Clear a manual status override: re-applies whatever Amazon's last
 * import said. The Amazon value is whatever's currently in `raw_data`
 * under operationalStatus (the import puts it there even when the
 * override blocks status writes).
 */
export async function clearVehicleStatusOverride(
  input: z.infer<typeof ClearOverrideSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = ClearOverrideSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();

  const { data: row, error: readErr } = await supabase
    .from("vehicles")
    .select("raw_data")
    .eq("id", parsed.data.vehicle_id)
    .single();
  if (readErr) return { ok: false, error: readErr.message };

  const amazonRaw = (row?.raw_data as Record<string, unknown> | null)
    ?.operationalStatus;
  const mapped =
    typeof amazonRaw === "string"
      ? amazonRaw.trim().toUpperCase() === "GROUNDED"
        ? "grounded"
        : amazonRaw.trim().toUpperCase() === "READY_FOR_AUDIT"
          ? "ready_for_audit"
          : "operational"
      : "operational";

  const { error } = await supabase
    .from("vehicles")
    .update({
      operational_status: mapped,
      operational_status_source: "amazon",
      operational_status_changed_at: new Date().toISOString(),
      operational_status_changed_by: null,
      manual_status_note: null,
    })
    .eq("id", parsed.data.vehicle_id);
  if (error) return { ok: false, error: error.message };

  // Re-run grounding side effects so auto-issues open/close as if Amazon's
  // value had just been applied via import.
  await supabase.rpc("apply_vehicle_grounding_changes", {
    affected_vehicle_ids: [parsed.data.vehicle_id],
  });

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
const IssueCategory = z.enum([
  "damage",
  "mechanical",
  "electrical",
  "cosmetic",
  "tires",
  "other",
]);
const IssueSeverity = z.enum(["minor", "moderate", "major", "out_of_service"]);
const IssueStatus = z.enum(["open", "in_shop", "fixed", "closed_no_repair"]);

const CreateIssueSchema = z.object({
  vehicle_id: z.string().uuid(),
  category: IssueCategory.default("other"),
  severity: IssueSeverity.default("minor"),
  description: z.string().trim().min(1, "Description is required").max(2000),
  status: IssueStatus.default("open"),
});

export async function createVehicleIssue(
  input: z.infer<typeof CreateIssueSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = CreateIssueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("vehicle_issues").insert({
    ...parsed.data,
    reported_by: user?.id ?? null,
    auto_created: false,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

const UpdateIssueSchema = z.object({
  issue_id: z.string().uuid(),
  category: IssueCategory,
  severity: IssueSeverity,
  description: z.string().trim().min(1).max(2000),
  status: IssueStatus,
  resolution_notes: NullableTrim,
});

export async function updateVehicleIssue(
  input: z.infer<typeof UpdateIssueSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpdateIssueSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { issue_id, status, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest, status };
  if (status === "fixed" || status === "closed_no_repair") {
    patch.resolved_at = new Date().toISOString();
  } else {
    patch.resolved_at = null;
  }

  const { error } = await supabase
    .from("vehicle_issues")
    .update(patch)
    .eq("id", issue_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------
const PartStatus = z.enum([
  "needed",
  "ordered",
  "partial",
  "received",
  "installed",
  "returned",
]);

const CreatePartSchema = z.object({
  vehicle_id: z.string().uuid(),
  issue_id: z.string().uuid().nullable().optional(),
  part_name: z.string().trim().min(1, "Part name is required").max(200),
  part_number: NullableTrim,
  quantity_ordered: z.number().int().min(0).default(0),
  status: PartStatus.default("needed"),
  vendor: NullableTrim,
  cost: z.number().nonnegative().nullable().optional(),
  ordered_at: z.string().datetime().nullable().optional(),
  notes: NullableTrim,
});

export async function createVehiclePart(
  input: z.infer<typeof CreatePartSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = CreatePartSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_parts").insert(parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet/vans");
  return { ok: true };
}

const UpdatePartQuantitiesSchema = z.object({
  part_id: z.string().uuid(),
  quantity_ordered: z.number().int().min(0),
  quantity_received: z.number().int().min(0),
  quantity_installed: z.number().int().min(0),
  status: PartStatus,
  notes: NullableTrim,
});

export async function updateVehiclePart(
  input: z.infer<typeof UpdatePartQuantitiesSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = UpdatePartQuantitiesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const { part_id, ...patch } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_parts")
    .update(patch)
    .eq("id", part_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet/vans");
  return { ok: true };
}

const DeletePartSchema = z.object({ part_id: z.string().uuid() });

export async function deleteVehiclePart(
  input: z.infer<typeof DeletePartSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeletePartSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_parts")
    .delete()
    .eq("id", parsed.data.part_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet/vans");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// PAVE inspections
// ---------------------------------------------------------------------------
const CreatePaveSchema = z.object({
  vehicle_id: z.string().uuid(),
  completed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export async function createPaveInspection(
  input: z.infer<typeof CreatePaveSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = CreatePaveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // quarter/year are auto-derived from completed_date by the DB trigger.
  // Send placeholder values that satisfy the not-null check.
  const placeholderDate = new Date(`${parsed.data.completed_date}T00:00:00Z`);
  const placeholderQuarter = Math.floor(placeholderDate.getUTCMonth() / 3) + 1;
  const placeholderYear = placeholderDate.getUTCFullYear();

  const { error } = await supabase.from("vehicle_pave_inspections").insert({
    vehicle_id: parsed.data.vehicle_id,
    completed_date: parsed.data.completed_date,
    score: parsed.data.score,
    quarter: placeholderQuarter,
    year: placeholderYear,
    recorded_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

const DeletePaveSchema = z.object({ inspection_id: z.string().uuid() });

export async function deletePaveInspection(
  input: z.infer<typeof DeletePaveSchema>,
): Promise<ActionResult> {
  await requireManagement();
  const parsed = DeletePaveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_pave_inspections")
    .delete()
    .eq("id", parsed.data.inspection_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");
  return { ok: true };
}

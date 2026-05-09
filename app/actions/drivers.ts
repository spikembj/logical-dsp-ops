"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const StatusSchema = z.enum(["active", "loa", "terminated", "inactive"]);
const VehicleSchema = z.enum(["cdv", "edv", "step_van", "rivian"]);

const CreateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  transporter_id: z
    .string()
    .trim()
    .regex(/^A[A-Z0-9]{10,18}$/i, "Must look like A1B2... (Amazon transporter ID)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : null)),
  status: StatusSchema.default("active"),
  hire_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  approved_vehicle_types: z.array(VehicleSchema).default([]),
  notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const UpdateSchema = CreateSchema.extend({
  driver_id: z.string().uuid(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createDriver(
  input: z.infer<typeof CreateSchema>,
): Promise<ActionResult> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").insert(parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/drivers");
  revalidatePath("/drivers");
  return { ok: true };
}

export async function updateDriver(
  input: z.infer<typeof UpdateSchema>,
): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { driver_id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("drivers")
    .update(patch)
    .eq("id", driver_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/drivers");
  revalidatePath("/drivers");
  revalidatePath(`/drivers/${driver_id}`);
  return { ok: true };
}

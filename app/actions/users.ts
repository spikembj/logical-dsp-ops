"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";

const RoleSchema = z.enum([
  "owner",
  "hr",
  "ops_manager",
  "dispatcher",
  // legacy values still accepted for compat
  "admin",
  "manager",
]);
const InviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().trim().min(1).max(120),
  role: RoleSchema,
});
const SetRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: RoleSchema,
});
const SetActiveSchema = z.object({
  user_id: z.string().uuid(),
  active: z.boolean(),
});
const SetDriverLinkSchema = z.object({
  user_id: z.string().uuid(),
  driver_id: z.string().uuid().nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireManagement(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

/**
 * Invite a teammate by email. Creates an auth.users row immediately and
 * emails them a magic-link to set their password. Pre-creates the
 * public.users row with the chosen role + name.
 */
export async function inviteUser(
  input: z.infer<typeof InviteSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;

  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }
  const { email, full_name, role } = parsed.data;

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    return { ok: false, error: `Invite failed: ${error.message}` };
  }
  const newUserId = data?.user?.id;
  if (!newUserId) {
    return { ok: false, error: "Invite returned no user id." };
  }

  const { error: insErr } = await admin.from("users").upsert({
    id: newUserId,
    email,
    full_name,
    role,
    active: true,
  });
  if (insErr) {
    return {
      ok: false,
      error: `Auth user created but profile insert failed: ${insErr.message}`,
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRole(
  input: z.infer<typeof SetRoleSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;
  const parsed = SetRoleSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ role: parsed.data.role as UserRole })
    .eq("id", parsed.data.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(
  input: z.infer<typeof SetActiveSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;
  const parsed = SetActiveSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Link a user to a driver record (or clear the link with driver_id: null).
 * Enforced one-to-one via a partial unique index — attempting to link a
 * driver that's already linked to another user surfaces the DB constraint
 * error verbatim, which is fine for this admin-only screen.
 */
export async function setUserDriverLink(
  input: z.infer<typeof SetDriverLinkSchema>,
): Promise<ActionResult> {
  const gate = await requireManagement();
  if (!gate.ok) return gate;
  const parsed = SetDriverLinkSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ driver_id: parsed.data.driver_id })
    .eq("id", parsed.data.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

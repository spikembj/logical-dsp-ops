import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MANAGEMENT_ROLES,
  type UserRole,
  type UserRow,
} from "@/lib/types/database";

/** Convenience: gate a page to anyone with management-tier write access. */
export function requireManagement() {
  return requireRole(MANAGEMENT_ROLES);
}

type Me = Pick<UserRow, "id" | "email" | "full_name" | "role" | "active">;

/**
 * In-app role gate for use at the top of Server Components / route handlers.
 * RLS in Postgres is the safety net — this is the UX layer.
 *
 * Returns the authenticated user's profile row. Redirects if:
 *   - not authenticated
 *   - user is inactive
 *   - user's role is not in the allowed list
 *
 * @example
 *   export default async function AdminPage() {
 *     const me = await requireRole(["admin"]);
 *     // ...
 *   }
 */
export async function requireRole(allowed: UserRole[]): Promise<Me> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as Me | null;

  if (!profile || !profile.active) {
    redirect("/login?error=inactive");
  }

  if (!allowed.includes(profile.role)) {
    redirect("/");
  }

  return profile;
}

/**
 * Looser variant — only checks that the user is authenticated and active.
 * Use on shared pages (dashboard, drivers list, driver detail) where every
 * role is allowed to view.
 */
export async function requireUser() {
  return requireRole(["owner", "hr", "ops_manager", "dispatcher", "admin", "manager"]);
}

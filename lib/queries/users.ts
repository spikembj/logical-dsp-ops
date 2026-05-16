import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types/database";

/**
 * UserRow plus the linked driver's name (when users.driver_id is set).
 * The Management page renders the driver name as a clickable link to the
 * driver profile.
 */
export interface UserListItem extends UserRow {
  linked_driver: { id: string; full_name: string } | null;
}

export const listUsers = cache(async (): Promise<UserListItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id, email, full_name, role, active, created_at, driver_id,
      linked_driver:drivers!users_driver_id_fkey ( id, full_name )
    `,
    )
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listUsers failed:", error);
    return [];
  }
  const flatten = (
    v: unknown,
  ): { id: string; full_name: string } | null => {
    if (!v) return null;
    if (Array.isArray(v))
      return (v[0] as { id: string; full_name: string } | undefined) ?? null;
    return v as { id: string; full_name: string };
  };
  return (data ?? []).map((r) => ({
    ...(r as unknown as UserRow),
    linked_driver: flatten(
      (r as { linked_driver?: unknown }).linked_driver,
    ),
  })) as UserListItem[];
});

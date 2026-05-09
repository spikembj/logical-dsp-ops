import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types/database";

export const listUsers = cache(async (): Promise<UserRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, active, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listUsers failed:", error);
    return [];
  }
  return (data ?? []) as UserRow[];
});

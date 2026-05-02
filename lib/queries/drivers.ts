import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DriverRow } from "@/lib/types/database";

/**
 * Server-only query helpers for the drivers list and detail pages.
 *
 * These wrap the Supabase client so page components stay free of query
 * boilerplate. Once we have scorecards/coaching data, this is also where
 * the joined "current tier" and "last coached" lookups will live.
 */

export type DriverListItem = DriverRow & {
  // Will be populated in step 4 (scorecards) and step 3 (coaching).
  current_tier: null | DriverRow["status"]; // placeholder type slot
  last_coached_at: string | null;
};

/**
 * Fetch all drivers, ordered by name. RLS already restricts this to active
 * users; we don't need any additional gating here.
 */
export async function listDrivers(): Promise<DriverRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, transporter_id, full_name, hire_date, status, approved_vehicle_types, notes, created_at, updated_at",
    )
    .order("full_name", { ascending: true });

  if (error) {
    // Surface the error to the page so it can show an empty state.
    console.error("listDrivers failed:", error);
    return [];
  }

  return (data ?? []) as DriverRow[];
}

/**
 * Fetch a single driver by id. Returns null if not found (used to render 404).
 *
 * Wrapped in React's cache() so multiple components (e.g. layout + page)
 * within the same request only hit the database once.
 */
export const getDriverById = cache(
  async (id: string): Promise<DriverRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drivers")
      .select(
        "id, transporter_id, full_name, hire_date, status, approved_vehicle_types, notes, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getDriverById failed:", error);
      return null;
    }

    return (data as DriverRow | null) ?? null;
  },
);

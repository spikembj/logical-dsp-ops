import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface SafetyEventRow {
  id: string;
  driver_id: string;
  event_date: string; // ISO timestamptz
  event_type: string;
  severity: "impacting" | "non_impacting";
  count: number;
  source: string;
  notes: string | null;
  raw_data: Record<string, unknown> | null;
  imported_from: string | null;
  created_at: string;
}

/**
 * All safety events for a driver, newest first. Filtering by date range and
 * severity is done in the page component (small dataset per driver) — keeps
 * the query simple and lets toggles flip without a server round-trip.
 */
export const listEventsForDriver = cache(
  async (driverId: string): Promise<SafetyEventRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("safety_events")
      .select(
        `id, driver_id, event_date, event_type, severity, count, source,
         notes, raw_data, imported_from, created_at`,
      )
      .eq("driver_id", driverId)
      .order("event_date", { ascending: false })
      .order("event_type", { ascending: true });

    if (error) {
      console.error("listEventsForDriver failed:", error);
      return [];
    }
    return (data ?? []) as SafetyEventRow[];
  },
);

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  DailyRosterEntry,
  DailyRosterRow,
  WaveTime,
} from "./daily-ops-types";

export * from "./daily-ops-types";

/**
 * Server-only queries for Daily Ops.
 *
 * Scope reminder: this is the dispatcher's morning workspace. They edit
 * the roster live during standup; we just need fast joined reads of
 * "today's roster" + the lookup data for the pickers.
 */

/** All wave_times rows, ordered by wave number. */
export const listWaveTimes = cache(async (): Promise<WaveTime[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wave_times")
    .select("*")
    .order("wave");
  if (error) {
    console.error("listWaveTimes failed:", error);
    return [];
  }
  return (data as WaveTime[]) ?? [];
});

/**
 * Get the roster for a specific date, joined with driver name, vehicle
 * name + VIN, and the wave's show time. Sorted by wave then vehicle.
 */
export const getRosterForDate = cache(
  async (date: string): Promise<DailyRosterEntry[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_roster")
      .select(
        `id, date, driver_id, vehicle_id, wave, notes,
         created_at, updated_at, created_by, updated_by,
         drivers (full_name),
         vehicles (vehicle_name, vin),
         wave_times (show_time)`,
      )
      .eq("date", date);
    if (error) {
      console.error("getRosterForDate failed:", error);
      return [];
    }
    type Joined = DailyRosterRow & {
      drivers: { full_name: string } | null;
      vehicles: { vehicle_name: string | null; vin: string } | null;
      wave_times: { show_time: string } | null;
    };
    // Supabase types nested selects as arrays even for many-to-one
    // joins; the runtime shape is a single object so cast via unknown.
    const entries: DailyRosterEntry[] = (data as unknown as Joined[]).map((r) => ({
      id: r.id,
      date: r.date,
      driver_id: r.driver_id,
      vehicle_id: r.vehicle_id,
      wave: r.wave,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by,
      updated_by: r.updated_by,
      driver_name: r.drivers?.full_name ?? "(deleted driver)",
      vehicle_name: r.vehicles?.vehicle_name ?? null,
      vehicle_vin: r.vehicles?.vin ?? "",
      show_time: r.wave_times?.show_time ?? "",
    }));
    // Sort by wave asc, then by vehicle name asc.
    entries.sort((a, b) => {
      if (a.wave !== b.wave) return a.wave - b.wave;
      const an = a.vehicle_name ?? "";
      const bn = b.vehicle_name ?? "";
      return an.localeCompare(bn);
    });
    return entries;
  },
);

/**
 * Most recent date before `before` that has any roster rows. Used by
 * the "Copy from yesterday" button — handles weekends/skipped days
 * cleanly by finding the actual prior working day, not just "date - 1".
 */
export const getMostRecentRosterDate = cache(
  async (before: string): Promise<string | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_roster")
      .select("date")
      .lt("date", before)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("getMostRecentRosterDate failed:", error);
      return null;
    }
    return (data?.date as string | undefined) ?? null;
  },
);

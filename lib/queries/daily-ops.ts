import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  DailyReportRow,
  DailyRosterEntry,
  DailyRosterRow,
  EodVanNote,
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
 * For each vehicle, return the most recent driver assigned to it before
 * `before`. Used to prefill the driver column on a fresh roster — the
 * dispatcher told us the common case is "same driver as yesterday, just
 * need to pick today's wave."
 *
 * Pure JS reduction over a date-desc query. At fleet-of-60-vans scale
 * this is cheap; if it ever gets slow we can swap in a SQL DISTINCT ON.
 */
export const getMostRecentDriverByVehicle = cache(
  async (beforeDate: string): Promise<Map<string, string>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_roster")
      .select("vehicle_id, driver_id, date")
      .lt("date", beforeDate)
      .order("date", { ascending: false });
    if (error) {
      console.error("getMostRecentDriverByVehicle failed:", error);
      return new Map();
    }
    const m = new Map<string, string>();
    for (const r of (data ?? []) as {
      vehicle_id: string;
      driver_id: string;
    }[]) {
      if (!m.has(r.vehicle_id)) m.set(r.vehicle_id, r.driver_id);
    }
    return m;
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

// ---------------------------------------------------------------------------
// End-of-day report
// ---------------------------------------------------------------------------

/** Get the EOD report for a date, or null if none has been started yet. */
export const getDailyReport = cache(
  async (date: string): Promise<DailyReportRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_report")
      .select("*")
      .eq("date", date)
      .maybeSingle();
    if (error) {
      console.error("getDailyReport failed:", error);
      return null;
    }
    return (data as DailyReportRow | null) ?? null;
  },
);

/**
 * Per-van notes logged via the EOD form for a given date. Joined with
 * the vehicle name + VIN so the page can render them without a second
 * lookup.
 *
 * Filters: source='eod' AND created_at::date = report_date. We don't
 * tie EOD notes to the daily_report row by FK — they're independent
 * vehicle_issues rows that just happen to have been created from the
 * EOD form. The date filter is how we group them visually.
 */
export const listEodNotesForDate = cache(
  async (date: string): Promise<EodVanNote[]> => {
    const supabase = await createClient();
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59.999Z`;
    const { data, error } = await supabase
      .from("vehicle_issues")
      .select(
        `id, vehicle_id, description, created_at,
         vehicles (vehicle_name, vin)`,
      )
      .eq("source", "eod")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("listEodNotesForDate failed:", error);
      return [];
    }
    type Joined = {
      id: string;
      vehicle_id: string;
      description: string;
      created_at: string;
      vehicles: { vehicle_name: string | null; vin: string } | null;
    };
    return ((data ?? []) as unknown as Joined[]).map((r) => ({
      id: r.id,
      vehicle_id: r.vehicle_id,
      description: r.description,
      created_at: r.created_at,
      vehicle_name: r.vehicles?.vehicle_name ?? r.vehicles?.vin ?? "?",
      vehicle_vin: r.vehicles?.vin ?? "",
    }));
  },
);

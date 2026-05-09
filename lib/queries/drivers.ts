import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DriverRow, Tier } from "@/lib/types/database";

/**
 * Server-only query helpers for the drivers list and detail pages.
 *
 * The drivers list and driver-detail header both want each driver's
 * "current standing" — that's the most recent scorecard's tier and
 * overall_score. Stored on the scorecards table, joined here.
 */

export interface DriverListItem extends DriverRow {
  latest_tier: Tier | null;
  latest_overall_score: number | null;
  latest_week_ending: string | null;
}

export interface LatestScorecard {
  tier: Tier | null;
  overall_score: number | null;
  week_ending: string;
}

/**
 * Fetch all scorecards (lightweight columns only) and build a map of
 * latest-per-driver. We rely on Postgres ordering and take the first
 * occurrence per driver_id in JS — no DISTINCT ON needed.
 */
async function loadLatestScorecards(): Promise<Map<string, LatestScorecard>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scorecards")
    .select("driver_id, week_ending, tier, overall_score")
    .order("week_ending", { ascending: false });
  if (error) {
    console.error("loadLatestScorecards failed:", error);
    return new Map();
  }
  const m = new Map<string, LatestScorecard>();
  for (const s of data ?? []) {
    if (!m.has(s.driver_id as string)) {
      m.set(s.driver_id as string, {
        tier: (s.tier as Tier | null) ?? null,
        overall_score: (s.overall_score as number | null) ?? null,
        week_ending: s.week_ending as string,
      });
    }
  }
  return m;
}

/**
 * Fetch all drivers with their latest scorecard merged in. Sorted by name.
 */
export async function listDrivers(): Promise<DriverListItem[]> {
  const supabase = await createClient();
  const [driversRes, latest] = await Promise.all([
    supabase
      .from("drivers")
      .select(
        "id, transporter_id, full_name, hire_date, status, position, approved_vehicle_types, notes, created_at, updated_at",
      )
      .order("full_name", { ascending: true }),
    loadLatestScorecards(),
  ]);

  if (driversRes.error) {
    console.error("listDrivers failed:", driversRes.error);
    return [];
  }

  return ((driversRes.data ?? []) as DriverRow[]).map((d) => {
    const ls = latest.get(d.id);
    return {
      ...d,
      latest_tier: ls?.tier ?? null,
      latest_overall_score: ls?.overall_score ?? null,
      latest_week_ending: ls?.week_ending ?? null,
    };
  });
}

/**
 * Fetch a single driver by id. Returns null if not found.
 */
export const getDriverById = cache(
  async (id: string): Promise<DriverRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("drivers")
      .select(
        "id, transporter_id, full_name, hire_date, status, position, approved_vehicle_types, notes, created_at, updated_at",
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

/**
 * Single driver's most recent scorecard (tier + overall_score + week).
 * Cached per request so the layout + page can both call it.
 */
export const getLatestScorecard = cache(
  async (driverId: string): Promise<LatestScorecard | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scorecards")
      .select("week_ending, tier, overall_score")
      .eq("driver_id", driverId)
      .order("week_ending", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      tier: (data.tier as Tier | null) ?? null,
      overall_score: (data.overall_score as number | null) ?? null,
      week_ending: data.week_ending as string,
    };
  },
);

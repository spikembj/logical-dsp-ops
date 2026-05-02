import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface ScorecardRow {
  id: string;
  driver_id: string;
  week_ending: string; // YYYY-MM-DD
  tier: string | null;
  fico_score: number | null;
  dcr: number | null;
  delivery_completion_rate: number | null;
  cdf: number | null;
  seatbelt_off_rate: number | null;
  speeding_event_rate: number | null;
  distractions_rate: number | null;
  following_distance_rate: number | null;
  sign_signal_violations_rate: number | null;
  raw_data: Record<string, unknown> | null;
  imported_from: string | null;
  created_at: string;
}

/**
 * Fetch all scorecards for a driver, newest week first. Cached per request.
 */
export const listScorecardsForDriver = cache(
  async (driverId: string): Promise<ScorecardRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scorecards")
      .select(
        `
        id, driver_id, week_ending, tier, fico_score, dcr,
        delivery_completion_rate, cdf,
        seatbelt_off_rate, speeding_event_rate, distractions_rate,
        following_distance_rate, sign_signal_violations_rate,
        raw_data, imported_from, created_at
      `,
      )
      .eq("driver_id", driverId)
      .order("week_ending", { ascending: false });

    if (error) {
      console.error("listScorecardsForDriver failed:", error);
      return [];
    }
    return (data ?? []) as ScorecardRow[];
  },
);

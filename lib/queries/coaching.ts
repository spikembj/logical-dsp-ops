import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * A single coaching session with the coach's display info joined in.
 * Hand-typed for now; once we regenerate types from the live schema,
 * we can drop this and use the generated types directly.
 */
export interface CoachingSessionListItem {
  id: string;
  driver_id: string;
  session_date: string; // ISO date (YYYY-MM-DD)
  topic: string;
  notes: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  linked_scorecard_id: string | null;
  linked_event_ids: string[];
  created_at: string;
  updated_at: string;
  coached_by: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

/**
 * Fetch every coaching session for a driver, newest first. Joins to public.users
 * via the coached_by FK so the UI can show "coached by [name]" without a second
 * round-trip.
 *
 * Cached per-request so the page + any parallel components share one query.
 */
export const listSessionsForDriver = cache(
  async (driverId: string): Promise<CoachingSessionListItem[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coaching_sessions")
      .select(
        `
        id, driver_id, session_date, topic, notes,
        acknowledged, acknowledged_at,
        linked_scorecard_id, linked_event_ids,
        created_at, updated_at,
        coached_by:users!coaching_sessions_coached_by_fkey (
          id, full_name, email
        )
      `,
      )
      .eq("driver_id", driverId)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listSessionsForDriver failed:", error);
      return [];
    }

    // Supabase types the joined relation as an array by default; we know it's
    // a single row because coached_by is a non-nullable scalar FK.
    return (data ?? []).map((r) => ({
      ...r,
      coached_by: Array.isArray(r.coached_by)
        ? (r.coached_by[0] ?? null)
        : r.coached_by,
    })) as CoachingSessionListItem[];
  },
);

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CoachingSessionType } from "@/lib/types/database";

interface UserMini {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Most recent non-voided coaching session date for a single driver, or null.
 * Used by the driver detail header to show "Last coached: 3 days ago".
 * Cached per request so the layout + page can both call it without
 * a second round-trip.
 */
export const getLatestCoachingForDriver = cache(
  async (driverId: string): Promise<string | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coaching_sessions")
      .select("session_date")
      .eq("driver_id", driverId)
      .is("voided_at", null)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.session_date as string;
  },
);

/**
 * A single coaching session with the coach + voider display info joined in.
 * Hand-typed for now; once we regenerate types from the live schema,
 * we can drop this and use the generated types directly.
 */
export interface CoachingSessionListItem {
  id: string;
  driver_id: string;
  session_date: string; // ISO date (YYYY-MM-DD)
  session_type: CoachingSessionType;
  topic: string;
  notes: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  linked_scorecard_id: string | null;
  linked_event_ids: string[];
  voided_at: string | null;
  voided_by_id: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  coached_by: UserMini | null;
  voided_by: UserMini | null;
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
        id, driver_id, session_date, session_type, topic, notes,
        acknowledged, acknowledged_at,
        linked_scorecard_id, linked_event_ids,
        voided_at, void_reason,
        voided_by_id:voided_by,
        created_at, updated_at,
        coached_by:users!coaching_sessions_coached_by_fkey (
          id, full_name, email
        ),
        voided_by:users!coaching_sessions_voided_by_fkey (
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

    const flatten = (v: unknown): UserMini | null => {
      if (!v) return null;
      if (Array.isArray(v)) return (v[0] as UserMini) ?? null;
      return v as UserMini;
    };

    return (data ?? []).map((r) => ({
      ...r,
      coached_by: flatten(r.coached_by),
      voided_by: flatten(r.voided_by),
    })) as CoachingSessionListItem[];
  },
);

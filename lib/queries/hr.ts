import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { HR_REVIEWABLE_SESSION_TYPES } from "./hr-types";
import type {
  HrCoachingReviewRow,
  HrQueueMode,
  OffenderRow,
} from "./hr-types";
import type { CoachingCategory } from "@/lib/util/coaching-prefill";
import type { CoachingSessionType } from "@/lib/types/database";

/**
 * Server-only queries for the HR dashboard.
 * Types + pure helpers live in `./hr-types` so client components can
 * import them without dragging this server module into the bundle.
 */
export * from "./hr-types";

type SupabaseUserMini = { id: string; full_name: string | null; email: string };
type SupabaseDriverMini = { full_name: string };

interface SupabaseQueueRow {
  id: string;
  driver_id: string;
  session_date: string;
  session_type: CoachingSessionType;
  category: CoachingCategory;
  topic: string;
  notes: string | null;
  hr_reviewed_at: string | null;
  hr_review_notes: string | null;
  voided_at: string | null;
  drivers: SupabaseDriverMini | SupabaseDriverMini[] | null;
  coached_by_user: SupabaseUserMini | SupabaseUserMini[] | null;
  hr_reviewed_by_user: SupabaseUserMini | SupabaseUserMini[] | null;
}

function flattenOne<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v;
}

const SELECT_QUEUE = `
  id, driver_id, session_date, session_type, category, topic, notes,
  hr_reviewed_at, hr_review_notes, voided_at,
  drivers ( full_name ),
  coached_by_user:users!coaching_sessions_coached_by_fkey ( id, full_name, email ),
  hr_reviewed_by_user:users!coaching_sessions_hr_reviewed_by_fkey ( id, full_name, email )
`;

function mapQueueRow(r: SupabaseQueueRow): HrCoachingReviewRow {
  const driver = flattenOne(r.drivers);
  const coach = flattenOne(r.coached_by_user);
  const reviewer = flattenOne(r.hr_reviewed_by_user);
  return {
    id: r.id,
    driver_id: r.driver_id,
    driver_name: driver?.full_name ?? "Unknown driver",
    session_date: r.session_date,
    session_type: r.session_type,
    category: r.category,
    topic: r.topic,
    notes: r.notes,
    coached_by_name: coach?.full_name ?? coach?.email ?? null,
    hr_reviewed_at: r.hr_reviewed_at,
    hr_reviewed_by_id: reviewer?.id ?? null,
    hr_reviewed_by_name: reviewer?.full_name ?? reviewer?.email ?? null,
    hr_review_notes: r.hr_review_notes,
    voided_at: r.voided_at,
  };
}

/**
 * Every coaching session that needs HR review, newest first.
 * `mode='unreviewed'` (default) hides rows already signed off; pass
 * `mode='all'` to include them, or `mode='reviewed'` to see only signed
 * rows. Trainings + discussions are excluded in all modes — they never
 * need HR.
 *
 * Capped at 500 rows to keep the queue snappy. If HR ever needs more
 * history we can add date-range filters; in practice the queue should
 * drain to single digits.
 */
export const listHrCoachingQueue = cache(
  async (mode: HrQueueMode = "unreviewed"): Promise<HrCoachingReviewRow[]> => {
    const supabase = await createClient();
    let q = supabase
      .from("coaching_sessions")
      .select(SELECT_QUEUE)
      .in("session_type", HR_REVIEWABLE_SESSION_TYPES)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (mode === "unreviewed") q = q.is("hr_reviewed_at", null);
    if (mode === "reviewed") q = q.not("hr_reviewed_at", "is", null);

    const { data, error } = await q;
    if (error) {
      console.error("listHrCoachingQueue failed:", error);
      return [];
    }
    return ((data ?? []) as unknown as SupabaseQueueRow[]).map(mapQueueRow);
  },
);

/**
 * Headline counts for the HR landing tiles:
 *  - awaiting:           reviewable + unreviewed (all-time)
 *  - awaiting_recent:    awaiting whose session_date is in the last 30 days
 *  - reviewed_this_week: hr_reviewed_at within the last 7 days
 */
export interface HrCoachingCounts {
  awaiting: number;
  awaiting_recent_30d: number;
  reviewed_this_week: number;
}

export const getHrCoachingCounts = cache(
  async (): Promise<HrCoachingCounts> => {
    const supabase = await createClient();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toIso = (d: Date) => d.toISOString().slice(0, 10);

    const [allAwaitingRes, recentAwaitingRes, reviewedRes] = await Promise.all([
      supabase
        .from("coaching_sessions")
        .select("id", { count: "exact", head: true })
        .in("session_type", HR_REVIEWABLE_SESSION_TYPES)
        .is("hr_reviewed_at", null),
      supabase
        .from("coaching_sessions")
        .select("id", { count: "exact", head: true })
        .in("session_type", HR_REVIEWABLE_SESSION_TYPES)
        .is("hr_reviewed_at", null)
        .gte("session_date", toIso(thirtyDaysAgo)),
      supabase
        .from("coaching_sessions")
        .select("id", { count: "exact", head: true })
        .in("session_type", HR_REVIEWABLE_SESSION_TYPES)
        .gte("hr_reviewed_at", sevenDaysAgo.toISOString()),
    ]);

    return {
      awaiting: allAwaitingRes.count ?? 0,
      awaiting_recent_30d: recentAwaitingRes.count ?? 0,
      reviewed_this_week: reviewedRes.count ?? 0,
    };
  },
);

/**
 * Top-N drivers by coaching count over the last 90 days, excluding
 * trainings + discussions. Optional category filter — when set, only
 * sessions with that category count. Voided sessions are excluded
 * because they no longer represent valid actions against the driver.
 *
 * Returns up to `limit` rows (default 10), ordered by count descending
 * then by driver name for stable tie-breaks. Drivers with zero
 * qualifying sessions are not returned.
 */
export const getWorstOffenders90d = cache(
  async (
    category: CoachingCategory | "all" = "all",
    limit = 10,
  ): Promise<OffenderRow[]> => {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    let q = supabase
      .from("coaching_sessions")
      .select("driver_id, drivers(full_name)")
      .in("session_type", HR_REVIEWABLE_SESSION_TYPES)
      .is("voided_at", null)
      .gte("session_date", cutoff);

    if (category !== "all") q = q.eq("category", category);

    const { data, error } = await q;
    if (error) {
      console.error("getWorstOffenders90d failed:", error);
      return [];
    }

    const counts = new Map<string, { name: string; count: number }>();
    for (const r of (data ?? []) as unknown as {
      driver_id: string;
      drivers: SupabaseDriverMini | SupabaseDriverMini[] | null;
    }[]) {
      const d = flattenOne(r.drivers);
      const name = d?.full_name ?? "Unknown driver";
      const prev = counts.get(r.driver_id);
      if (prev) prev.count += 1;
      else counts.set(r.driver_id, { name, count: 1 });
    }

    return [...counts.entries()]
      .map(([driver_id, v]) => ({
        driver_id,
        driver_name: v.name,
        session_count: v.count,
      }))
      .sort((a, b) => {
        const d = b.session_count - a.session_count;
        if (d !== 0) return d;
        return a.driver_name.localeCompare(b.driver_name);
      })
      .slice(0, limit);
  },
);

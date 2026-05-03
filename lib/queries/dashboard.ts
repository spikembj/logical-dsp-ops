import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Server queries powering the dashboard. Everything is cached per request
 * so the four tiles + the two lists share a small set of round-trips.
 *
 * "This week" is anchored to the most recent activity in the database
 * (latest safety_event, scorecard, or coaching session — whichever is
 * newest), with a 7-day lookback. This keeps the dashboard meaningful
 * even when the latest imports are a few days behind today's calendar.
 */

const WEEK_MS = 7 * 86_400_000;

interface DashboardWindow {
  asOf: string; // YYYY-MM-DD — anchor date for "this week"
  start: string; // YYYY-MM-DD — 6 days before asOf
  startTs: string; // ISO timestamp at start, midnight UTC
  endTs: string; // ISO timestamp at asOf + 1 day, exclusive
}

/** Pick the anchor date — most recent activity in the DB, fall back to today. */
async function resolveWindow(): Promise<DashboardWindow> {
  const supabase = await createClient();
  const [evt, sc, sess] = await Promise.all([
    supabase
      .from("safety_events")
      .select("event_date")
      .order("event_date", { ascending: false })
      .limit(1),
    supabase
      .from("scorecards")
      .select("week_ending")
      .order("week_ending", { ascending: false })
      .limit(1),
    supabase
      .from("coaching_sessions")
      .select("session_date")
      .order("session_date", { ascending: false })
      .limit(1),
  ]);

  const candidates: number[] = [Date.now()];
  if (evt.data?.[0]?.event_date) candidates.push(Date.parse(evt.data[0].event_date));
  if (sc.data?.[0]?.week_ending)
    candidates.push(Date.parse(`${sc.data[0].week_ending}T00:00:00Z`));
  if (sess.data?.[0]?.session_date)
    candidates.push(Date.parse(`${sess.data[0].session_date}T00:00:00Z`));

  const anchor = new Date(Math.max(...candidates));
  // Round down to a day boundary in UTC for stable bucketing.
  const asOfDate = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
  );
  const startDate = new Date(asOfDate.getTime() - 6 * 86_400_000);
  const endDate = new Date(asOfDate.getTime() + 86_400_000);
  return {
    asOf: asOfDate.toISOString().slice(0, 10),
    start: startDate.toISOString().slice(0, 10),
    startTs: startDate.toISOString(),
    endTs: endDate.toISOString(),
  };
}

export const getDashboardData = cache(async () => {
  const supabase = await createClient();
  const win = await resolveWindow();

  // --- Stats -----------------------------------------------------------
  const [
    activeDriversRes,
    impactingRes,
    sessionsRes,
  ] = await Promise.all([
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("safety_events")
      .select("driver_id, count")
      .eq("severity", "impacting")
      .gte("event_date", win.startTs)
      .lt("event_date", win.endTs),
    supabase
      .from("coaching_sessions")
      .select("id, driver_id", { count: "exact" })
      .gte("session_date", win.start)
      .lte("session_date", win.asOf)
      .is("voided_at", null),
  ]);

  const activeDriverCount = activeDriversRes.count ?? 0;
  const impactingEventRows = impactingRes.data ?? [];
  const impactingEventTotal = impactingEventRows.reduce(
    (s, e) => s + (e.count ?? 0),
    0,
  );
  const sessionRows = sessionsRes.data ?? [];
  const coachedDriverIds = new Set(sessionRows.map((s) => s.driver_id));

  // --- Needs coaching --------------------------------------------------
  // Drivers in the impacting list whose driver_id is NOT in coachedDriverIds.
  type NeedsRow = {
    driver_id: string;
    full_name: string;
    transporter_id: string | null;
    total_events: number;
    event_types: string[];
  };
  const byDriver = new Map<string, NeedsRow>();
  for (const e of impactingEventRows) {
    if (coachedDriverIds.has(e.driver_id)) continue;
    if (!byDriver.has(e.driver_id)) {
      byDriver.set(e.driver_id, {
        driver_id: e.driver_id,
        full_name: "",
        transporter_id: null,
        total_events: 0,
        event_types: [],
      });
    }
  }
  // Hydrate driver names for the IDs we kept.
  if (byDriver.size > 0) {
    const ids = [...byDriver.keys()];
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, full_name, transporter_id")
      .in("id", ids);
    for (const d of drivers ?? []) {
      const row = byDriver.get(d.id);
      if (row) {
        row.full_name = d.full_name;
        row.transporter_id = d.transporter_id;
      }
    }
    // Now refetch event-type detail to populate per-driver event_types + counts.
    const { data: detail } = await supabase
      .from("safety_events")
      .select("driver_id, event_type, count")
      .eq("severity", "impacting")
      .gte("event_date", win.startTs)
      .lt("event_date", win.endTs)
      .in("driver_id", ids);
    for (const e of detail ?? []) {
      const row = byDriver.get(e.driver_id);
      if (!row) continue;
      row.total_events += e.count ?? 0;
      if (!row.event_types.includes(e.event_type))
        row.event_types.push(e.event_type);
    }
  }
  const needsCoaching = [...byDriver.values()]
    .filter((r) => r.full_name) // drop any that didn't hydrate (shouldn't happen)
    .sort((a, b) => b.total_events - a.total_events);

  // --- Recent coaching activity ---------------------------------------
  const { data: recentSessionsRaw } = await supabase
    .from("coaching_sessions")
    .select(
      `
      id, driver_id, session_date, topic, acknowledged, created_at,
      voided_at,
      driver:drivers!coaching_sessions_driver_id_fkey ( id, full_name ),
      coached_by:users!coaching_sessions_coached_by_fkey ( id, full_name, email )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(15);

  type Mini = { id: string; full_name: string | null; email?: string };
  const flatten = <T,>(v: T | T[] | null | undefined): T | null => {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  };
  const recentSessions = (recentSessionsRaw ?? [])
    .filter((s) => !s.voided_at)
    .slice(0, 10)
    .map((s) => ({
      id: s.id as string,
      driver_id: s.driver_id as string,
      session_date: s.session_date as string,
      topic: s.topic as string,
      acknowledged: s.acknowledged as boolean,
      created_at: s.created_at as string,
      driver: flatten(s.driver as unknown as Mini | Mini[]),
      coached_by: flatten(s.coached_by as unknown as Mini | Mini[]),
    }));

  return {
    window: win,
    stats: {
      activeDriverCount,
      impactingEventTotal,
      impactingEventRowCount: impactingEventRows.length,
      sessionCount: sessionsRes.count ?? sessionRows.length,
      needsCoachingCount: needsCoaching.length,
    },
    needsCoaching,
    recentSessions,
  };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

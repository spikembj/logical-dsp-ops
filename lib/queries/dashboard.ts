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
 *
 * "Active drivers" filters to drivers.status = 'active'. The
 * refresh_driver_active_status() RPC (called by every import) flips
 * drivers with no activity in the last 60 days to 'inactive', so this
 * count tracks the operational reality.
 */

interface DashboardWindow {
  asOf: string; // YYYY-MM-DD — anchor date
  start: string; // YYYY-MM-DD — 6 days before asOf
  startTs: string; // ISO timestamp at start, midnight UTC
  endTs: string; // ISO timestamp at asOf + 1 day, exclusive
}

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

// Quality coaching thresholds — sourced from the user's standards.
// A driver "needs Quality coaching" if their most recent scorecard fails
// any one of these.
const QUALITY_THRESHOLDS = {
  dcrMin: 99.0,        // %  : DCR < 99.0%
  podMin: 99.0,        // %  : POD < 99%
  cdfMax: 800,         // DPMO : CDF DPMO > 800
  cedMax: 0,           // count: any CED ≥ 1
  dsbMin: 233,         // DPMO : DSB < 233 (DSB is positive — higher = better)
  psbMaxPct: 10,       // %  : PSB defect rate > 10% (i.e. < 90% success)
} as const;

export interface QualityIssue {
  metric: string;
  value: number;
  threshold: string;
}

function evaluateScorecard(
  s: {
    dcr: number | null;
    pod: number | null;
    cdf: number | null;
    ced: number | null;
    dsb: number | null;
    psb: number | null;
  },
): QualityIssue[] {
  const out: QualityIssue[] = [];
  if (s.dcr !== null && s.dcr < QUALITY_THRESHOLDS.dcrMin) {
    out.push({ metric: "DCR", value: s.dcr, threshold: `< ${QUALITY_THRESHOLDS.dcrMin}%` });
  }
  if (s.pod !== null && s.pod < QUALITY_THRESHOLDS.podMin) {
    out.push({ metric: "POD", value: s.pod, threshold: `< ${QUALITY_THRESHOLDS.podMin}%` });
  }
  if (s.cdf !== null && s.cdf > QUALITY_THRESHOLDS.cdfMax) {
    out.push({ metric: "CDF DPMO", value: s.cdf, threshold: `> ${QUALITY_THRESHOLDS.cdfMax}` });
  }
  if (s.ced !== null && s.ced > QUALITY_THRESHOLDS.cedMax) {
    out.push({ metric: "CED", value: s.ced, threshold: `≥ 1` });
  }
  if (s.dsb !== null && s.dsb < QUALITY_THRESHOLDS.dsbMin) {
    out.push({ metric: "DSB", value: s.dsb, threshold: `< ${QUALITY_THRESHOLDS.dsbMin}` });
  }
  if (s.psb !== null && s.psb > QUALITY_THRESHOLDS.psbMaxPct) {
    out.push({
      metric: "PSB",
      value: s.psb,
      threshold: `> ${QUALITY_THRESHOLDS.psbMaxPct}% defect rate`,
    });
  }
  return out;
}

export const getDashboardData = cache(async () => {
  const supabase = await createClient();
  const win = await resolveWindow();

  // --- Stats -----------------------------------------------------------
  const [
    activeDriversRes,
    impactingRes,
    nonImpactingRes,
    sessionsRes,
  ] = await Promise.all([
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("safety_events")
      .select("driver_id, count, event_type")
      .eq("severity", "impacting")
      .gte("event_date", win.startTs)
      .lt("event_date", win.endTs),
    supabase
      .from("safety_events")
      .select("count")
      .eq("severity", "non_impacting")
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
  const nonImpactingEventTotal = (nonImpactingRes.data ?? []).reduce(
    (s, e) => s + (e.count ?? 0),
    0,
  );
  const sessionRows = sessionsRes.data ?? [];
  const coachedDriverIds = new Set(sessionRows.map((s) => s.driver_id));

  // --- Needs coaching: SAFETY ------------------------------------------
  type NeedsRow = {
    driver_id: string;
    full_name: string;
    transporter_id: string | null;
    total_events: number;
    event_types: string[];
    issues: string[]; // for quality side, populated below
  };
  const safetyByDriver = new Map<string, NeedsRow>();
  for (const e of impactingEventRows) {
    if (coachedDriverIds.has(e.driver_id)) continue;
    if (!safetyByDriver.has(e.driver_id)) {
      safetyByDriver.set(e.driver_id, {
        driver_id: e.driver_id,
        full_name: "",
        transporter_id: null,
        total_events: 0,
        event_types: [],
        issues: [],
      });
    }
    const row = safetyByDriver.get(e.driver_id)!;
    row.total_events += e.count ?? 0;
    if (!row.event_types.includes(e.event_type))
      row.event_types.push(e.event_type);
  }

  // --- Needs coaching: QUALITY -----------------------------------------
  // Pull the most recent scorecard per active driver and run threshold
  // checks. We use the latest week_ending from the scorecards table.
  const { data: latestWeekRes } = await supabase
    .from("scorecards")
    .select("week_ending")
    .order("week_ending", { ascending: false })
    .limit(1);
  const latestWeek: string | undefined = latestWeekRes?.[0]?.week_ending;

  const qualityByDriver = new Map<string, NeedsRow>();
  if (latestWeek) {
    const { data: latestCards } = await supabase
      .from("scorecards")
      .select("driver_id, dcr, pod, cdf, ced, dsb, psb")
      .eq("week_ending", latestWeek);
    for (const sc of latestCards ?? []) {
      if (coachedDriverIds.has(sc.driver_id)) continue;
      const issues = evaluateScorecard(sc);
      if (issues.length === 0) continue;
      qualityByDriver.set(sc.driver_id, {
        driver_id: sc.driver_id,
        full_name: "",
        transporter_id: null,
        total_events: issues.length,
        event_types: [],
        issues: issues.map((i) => `${i.metric} ${i.value} ${i.threshold}`),
      });
    }
  }

  // --- Hydrate driver names for both lists -----------------------------
  const allIds = [...new Set([...safetyByDriver.keys(), ...qualityByDriver.keys()])];
  if (allIds.length > 0) {
    const { data: drivers } = await supabase
      .from("drivers")
      .select("id, full_name, transporter_id, status")
      .in("id", allIds)
      .eq("status", "active");
    const okIds = new Set(drivers?.map((d) => d.id));
    for (const d of drivers ?? []) {
      if (safetyByDriver.has(d.id)) {
        const r = safetyByDriver.get(d.id)!;
        r.full_name = d.full_name;
        r.transporter_id = d.transporter_id;
      }
      if (qualityByDriver.has(d.id)) {
        const r = qualityByDriver.get(d.id)!;
        r.full_name = d.full_name;
        r.transporter_id = d.transporter_id;
      }
    }
    // Drop any rows whose driver isn't currently active.
    for (const id of [...safetyByDriver.keys()])
      if (!okIds.has(id)) safetyByDriver.delete(id);
    for (const id of [...qualityByDriver.keys()])
      if (!okIds.has(id)) qualityByDriver.delete(id);
  }

  const needsCoachingSafety = [...safetyByDriver.values()].sort(
    (a, b) => b.total_events - a.total_events,
  );
  const needsCoachingQuality = [...qualityByDriver.values()].sort(
    (a, b) => b.total_events - a.total_events,
  );

  // --- Recent coaching activity ---------------------------------------
  const { data: recentSessionsRaw } = await supabase
    .from("coaching_sessions")
    .select(
      `
      id, driver_id, session_date, session_type, topic, acknowledged, created_at,
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
      session_type: s.session_type as string,
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
      nonImpactingEventTotal,
      impactingEventRowCount: impactingEventRows.length,
      sessionCount: sessionsRes.count ?? sessionRows.length,
      needsSafetyCount: needsCoachingSafety.length,
      needsQualityCount: needsCoachingQuality.length,
    },
    needsCoachingSafety,
    needsCoachingQuality,
    recentSessions,
  };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

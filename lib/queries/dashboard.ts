import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { evaluateScorecard, QUALITY_THRESHOLDS } from "@/lib/queries/coaching-triggers";
import type { Tier } from "@/lib/types/database";

// Re-export the thresholds so the dashboard page can show them in the
// helper text.
export { QUALITY_THRESHOLDS };

/**
 * Minimum packages delivered in a week for a driver to qualify for the
 * dashboard leaderboards. ~one full route. Drivers who only ran a partial
 * day or a half-route have artificially loud DPMO numbers; we exclude
 * them so the leaderboards reflect real operational performance.
 */
export const MIN_LEADERBOARD_DELIVERIES = 400;

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

// Quality threshold logic + evaluateScorecard live in
// lib/queries/coaching-triggers.ts so the per-driver coaching tab
// shares them.

export interface CompanyTrendPoint {
  week_ending: string;
  overall_score: number | null;
  dcr: number | null;
  pod: number | null;
  driver_count: number; // sample size for the week (info only)
}

/**
 * Weekly company averages for the last 12 amazon weeks on record.
 *
 * Simple unweighted average across every driver who has a scorecard that
 * week — no minimum-volume filter, no current-status filter (a driver
 * terminated today still contributed to past weeks). We deliberately don't
 * volume-weight the average; Amazon's own DSP Overview doesn't either, so
 * weighting here would diverge from what the user sees in Amazon.
 *
 * Per-metric averages skip nulls independently — a driver missing a DCR
 * value doesn't drag down DCR's denominator, but they still count toward
 * Overall if they have one. driver_count is "how many drivers had any
 * scorecard data this week" for informational display.
 */
export const getCompanyTrend = cache(
  async (): Promise<CompanyTrendPoint[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scorecards")
      .select("week_ending, overall_score, dcr, pod")
      .order("week_ending", { ascending: false });
    if (error) {
      console.error("getCompanyTrend failed:", error);
      return [];
    }

    interface Accum {
      overallSum: number;
      overallCount: number;
      dcrSum: number;
      dcrCount: number;
      podSum: number;
      podCount: number;
      driverCount: number;
    }
    const byWeek = new Map<string, Accum>();
    for (const r of data ?? []) {
      const wk = r.week_ending as string;
      if (!byWeek.has(wk)) {
        byWeek.set(wk, {
          overallSum: 0,
          overallCount: 0,
          dcrSum: 0,
          dcrCount: 0,
          podSum: 0,
          podCount: 0,
          driverCount: 0,
        });
      }
      const a = byWeek.get(wk)!;
      a.driverCount += 1;
      if (r.overall_score !== null && r.overall_score !== undefined) {
        a.overallSum += r.overall_score;
        a.overallCount += 1;
      }
      if (r.dcr !== null && r.dcr !== undefined) {
        a.dcrSum += r.dcr;
        a.dcrCount += 1;
      }
      if (r.pod !== null && r.pod !== undefined) {
        a.podSum += r.pod;
        a.podCount += 1;
      }
    }

    const points: CompanyTrendPoint[] = [...byWeek.entries()]
      .map(([week_ending, a]) => ({
        week_ending,
        overall_score:
          a.overallCount > 0
            ? +(a.overallSum / a.overallCount).toFixed(2)
            : null,
        dcr: a.dcrCount > 0 ? +(a.dcrSum / a.dcrCount).toFixed(2) : null,
        pod: a.podCount > 0 ? +(a.podSum / a.podCount).toFixed(2) : null,
        driver_count: a.driverCount,
      }))
      .sort((a, b) => (a.week_ending < b.week_ending ? -1 : 1))
      .slice(-12); // newest 12 weeks
    return points;
  },
);

export interface LeaderboardRow {
  driver_id: string;
  full_name: string;
  tier: Tier | null;
  overall_score: number;
  delivered: number;
}

export interface MostImprovedRow {
  driver_id: string;
  full_name: string;
  current_score: number;
  prior_score: number;
  delta: number;
}

export interface DashboardLeaderboards {
  latestWeekEnding: string | null;
  priorWeekEnding: string | null;
  top: LeaderboardRow[];
  bottom: LeaderboardRow[];
  mostImproved: MostImprovedRow[];
  minDeliveries: number;
}

/**
 * Top 5 / Bottom 5 / Most improved leaderboards for the home dashboard.
 *
 * Eligibility (Top + Bottom): latest scorecard week, delivered >= 400,
 * driver.status = 'active'. Bottom 5 is "everyone meeting the threshold,
 * sorted up" — not filtered by whether the driver was coached this week.
 *
 * Most improved: same active + 400-pkg floor applied to *both* weeks
 * (latest and the one before). Sorted by score delta desc; only positive
 * deltas show. Top 3 returned. If nobody actually improved, we return an
 * empty array (the UI renders an empty state).
 *
 * Ties broken by full_name asc so the ordering is stable run-to-run.
 */
export const getDashboardLeaderboards = cache(
  async (): Promise<DashboardLeaderboards> => {
    const supabase = await createClient();
    // 1. Find the latest week we have any scorecard for.
    const { data: latestWk } = await supabase
      .from("scorecards")
      .select("week_ending")
      .order("week_ending", { ascending: false })
      .limit(1);
    const latestWeek = latestWk?.[0]?.week_ending as string | undefined;
    if (!latestWeek) {
      return {
        latestWeekEnding: null,
        priorWeekEnding: null,
        top: [],
        bottom: [],
        mostImproved: [],
        minDeliveries: MIN_LEADERBOARD_DELIVERIES,
      };
    }
    // Amazon weeks are Sun-Sat; the prior week ends 7 days earlier.
    const priorDate = new Date(`${latestWeek}T00:00:00Z`);
    priorDate.setUTCDate(priorDate.getUTCDate() - 7);
    const priorWeek = priorDate.toISOString().slice(0, 10);

    // 2. Pull both weeks' qualifying scorecards + the active-driver set.
    const [latestRes, priorRes, driversRes] = await Promise.all([
      supabase
        .from("scorecards")
        .select("driver_id, overall_score, delivered, tier")
        .eq("week_ending", latestWeek)
        .gte("delivered", MIN_LEADERBOARD_DELIVERIES)
        .not("overall_score", "is", null),
      supabase
        .from("scorecards")
        .select("driver_id, overall_score, delivered")
        .eq("week_ending", priorWeek)
        .gte("delivered", MIN_LEADERBOARD_DELIVERIES)
        .not("overall_score", "is", null),
      supabase
        .from("drivers")
        .select("id, full_name")
        .eq("status", "active"),
    ]);

    const activeDrivers = new Map<string, { full_name: string }>();
    for (const d of driversRes.data ?? []) {
      activeDrivers.set(d.id as string, {
        full_name: d.full_name as string,
      });
    }

    // 3. Build the leaderboard candidate pool: latest week × active drivers.
    const candidates: LeaderboardRow[] = [];
    for (const sc of latestRes.data ?? []) {
      const did = sc.driver_id as string;
      const drv = activeDrivers.get(did);
      if (!drv) continue;
      candidates.push({
        driver_id: did,
        full_name: drv.full_name,
        tier: (sc.tier as Tier | null) ?? null,
        overall_score: sc.overall_score as number,
        delivered: sc.delivered as number,
      });
    }

    // Top 5 — highest first; tie-break by name asc.
    const byScoreDesc = [...candidates].sort((a, b) =>
      b.overall_score !== a.overall_score
        ? b.overall_score - a.overall_score
        : a.full_name.localeCompare(b.full_name),
    );
    const top = byScoreDesc.slice(0, 5);

    // Bottom 5 — lowest first; tie-break by name asc.
    const byScoreAsc = [...candidates].sort((a, b) =>
      a.overall_score !== b.overall_score
        ? a.overall_score - b.overall_score
        : a.full_name.localeCompare(b.full_name),
    );
    const bottom = byScoreAsc.slice(0, 5);

    // 4. Most improved — intersect with prior-week scores.
    const priorScores = new Map<string, number>();
    for (const sc of priorRes.data ?? []) {
      priorScores.set(sc.driver_id as string, sc.overall_score as number);
    }
    const improved: MostImprovedRow[] = [];
    for (const c of candidates) {
      const prior = priorScores.get(c.driver_id);
      if (prior === undefined) continue;
      const delta = +(c.overall_score - prior).toFixed(2);
      if (delta <= 0) continue; // "improved" means positive movement only
      improved.push({
        driver_id: c.driver_id,
        full_name: c.full_name,
        current_score: c.overall_score,
        prior_score: prior,
        delta,
      });
    }
    improved.sort((a, b) =>
      b.delta !== a.delta
        ? b.delta - a.delta
        : a.full_name.localeCompare(b.full_name),
    );
    const mostImproved = improved.slice(0, 3);

    return {
      latestWeekEnding: latestWeek,
      priorWeekEnding: priorWeek,
      top,
      bottom,
      mostImproved,
      minDeliveries: MIN_LEADERBOARD_DELIVERIES,
    };
  },
);

export interface SafetyMix {
  weekStart: string; // YYYY-MM-DD (Sun)
  weekEnd: string; // YYYY-MM-DD (Sat)
  impacting: { byType: { event_type: string; count: number }[]; total: number };
  nonImpacting: {
    byType: { event_type: string; count: number }[];
    total: number;
  };
}

/**
 * Compute the previous *completed* Amazon week (Sun-Sat) relative to `now`.
 * If now is mid-week (Tue), the previous week is the most-recent Sun→Sat.
 * If now is Saturday itself, the previous week is still the one ending the
 * prior Saturday — today's not "completed" until midnight.
 */
function previousAmazonWeekRange(now: Date): {
  start: string;
  end: string;
} {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  // daysUntilNextSat ranges 0 (today is Sat) → 6 (today is Sun).
  const daysUntilNextSat = (6 - day + 7) % 7;
  const currentWeekEnd = new Date(now);
  currentWeekEnd.setUTCDate(currentWeekEnd.getUTCDate() + daysUntilNextSat);
  const previousWeekEnd = new Date(currentWeekEnd);
  previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() - 7);
  const previousWeekStart = new Date(previousWeekEnd);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 6);
  return {
    start: previousWeekStart.toISOString().slice(0, 10),
    end: previousWeekEnd.toISOString().slice(0, 10),
  };
}

/**
 * Aggregated safety events from the previous completed Amazon week, split
 * by severity into two groupings suitable for donut charts.
 *
 * The window is calendar-based (Sun-Sat just completed), not data-based —
 * the user downloads the safety report on Monday for the previous week, so
 * the donut should always reflect that fixed window even if a Netradyne
 * import lands a few days late.
 *
 * Per-type counts are sorted desc so the biggest slice / legend row is
 * first. Empty results return [] with total: 0; the UI renders an empty
 * state.
 */
export const getSafetyEventMix = cache(async (): Promise<SafetyMix> => {
  const supabase = await createClient();
  const range = previousAmazonWeekRange(new Date());

  // event_date is timestamptz. Window is half-open: [start 00:00Z, end+1 00:00Z).
  const endNext = new Date(`${range.end}T00:00:00Z`);
  endNext.setUTCDate(endNext.getUTCDate() + 1);

  const { data, error } = await supabase
    .from("safety_events")
    .select("event_type, severity, count")
    .gte("event_date", `${range.start}T00:00:00Z`)
    .lt("event_date", endNext.toISOString());

  if (error) {
    console.error("getSafetyEventMix failed:", error);
    return {
      weekStart: range.start,
      weekEnd: range.end,
      impacting: { byType: [], total: 0 },
      nonImpacting: { byType: [], total: 0 },
    };
  }

  const impactingCounts = new Map<string, number>();
  const nonImpactingCounts = new Map<string, number>();
  for (const r of data ?? []) {
    const target =
      r.severity === "impacting" ? impactingCounts : nonImpactingCounts;
    const k = (r.event_type as string) ?? "Unknown";
    target.set(k, (target.get(k) ?? 0) + ((r.count as number) ?? 0));
  }

  const toSortedArray = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([event_type, count]) => ({ event_type, count }))
      .filter((r) => r.count > 0)
      .sort((a, b) =>
        b.count !== a.count
          ? b.count - a.count
          : a.event_type.localeCompare(b.event_type),
      );

  const impByType = toSortedArray(impactingCounts);
  const nonByType = toSortedArray(nonImpactingCounts);
  return {
    weekStart: range.start,
    weekEnd: range.end,
    impacting: {
      byType: impByType,
      total: impByType.reduce((s, r) => s + r.count, 0),
    },
    nonImpacting: {
      byType: nonByType,
      total: nonByType.reduce((s, r) => s + r.count, 0),
    },
  };
});

export const getDashboardData = cache(async () => {
  const supabase = await createClient();
  const win = await resolveWindow();

  // --- Stats -----------------------------------------------------------
  // Active drivers (dashboard tile): drivers with activity in the last 30
  // days. This is stricter than the 60-day inactive-status cutoff — those
  // 30-60-day-stale drivers still appear as 'active' in the drivers list
  // but don't count toward the operational headcount.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
  const thirtyDaysAgoDate = thirtyDaysAgoIso.slice(0, 10);

  const [
    impactingRes,
    nonImpactingRes,
    sessionsRes,
    eventDriverIdsRes,
    scorecardDriverIdsRes,
  ] = await Promise.all([
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
    supabase
      .from("safety_events")
      .select("driver_id")
      .gte("event_date", thirtyDaysAgoIso),
    supabase
      .from("scorecards")
      .select("driver_id")
      .gte("week_ending", thirtyDaysAgoDate),
  ]);

  // Distinct drivers with any data in last 30 days, gated to status='active'.
  const recentDriverIds = new Set<string>();
  for (const r of eventDriverIdsRes.data ?? []) recentDriverIds.add(r.driver_id);
  for (const r of scorecardDriverIdsRes.data ?? []) recentDriverIds.add(r.driver_id);
  let activeDriverCount = 0;
  if (recentDriverIds.size > 0) {
    const { count } = await supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .in("id", [...recentDriverIds]);
    activeDriverCount = count ?? 0;
  }
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
  // checks. Combine with any open Amazon escalations.
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
      .select("driver_id, dcr, pod, cdf, ced, dsb, dsb_count, psb")
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

  // Add open Amazon escalations (any non-"Yes" ack_status) as quality triggers.
  const { data: openEscalations } = await supabase
    .from("escalations")
    .select("driver_id, behavior, ack_status");
  for (const e of openEscalations ?? []) {
    const ack = ((e.ack_status as string | null) ?? "").trim().toLowerCase();
    if (ack === "yes") continue;
    if (coachedDriverIds.has(e.driver_id as string)) continue;
    const did = e.driver_id as string;
    if (!qualityByDriver.has(did)) {
      qualityByDriver.set(did, {
        driver_id: did,
        full_name: "",
        transporter_id: null,
        total_events: 0,
        event_types: [],
        issues: [],
      });
    }
    const row = qualityByDriver.get(did)!;
    row.total_events += 1;
    row.issues.push(`Escalation: ${e.behavior}`);
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

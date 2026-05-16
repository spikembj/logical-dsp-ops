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
 * Safety tile #4 threshold: drivers flagged for intervention. A driver
 * crosses if they had **1+ impacting OR 4+ non-impacting** events in the
 * last 7 days. Looser cutoff for non-impacting because those are the
 * "habits" — distractions, weaving, hard braking — that matter in
 * aggregate, not per-instance.
 */
export const SAFETY_IMPACTING_THRESHOLD = 1;
export const SAFETY_NON_IMPACTING_THRESHOLD = 4;

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
  // Percentage-scale metrics (0-100; higher is better).
  overall_score: number | null;
  dcr: number | null;
  pod: number | null;
  // DPMO-scale metrics (defect rates; lower is better). Different scale,
  // rendered on a separate chart on the Quality dashboard.
  cdf: number | null;
  dsb: number | null;
  ced: number | null;
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
      .select("week_ending, overall_score, dcr, pod, cdf, dsb, ced")
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
      cdfSum: number;
      cdfCount: number;
      dsbSum: number;
      dsbCount: number;
      cedSum: number;
      cedCount: number;
      driverCount: number;
    }
    const empty = (): Accum => ({
      overallSum: 0,
      overallCount: 0,
      dcrSum: 0,
      dcrCount: 0,
      podSum: 0,
      podCount: 0,
      cdfSum: 0,
      cdfCount: 0,
      dsbSum: 0,
      dsbCount: 0,
      cedSum: 0,
      cedCount: 0,
      driverCount: 0,
    });
    const byWeek = new Map<string, Accum>();
    for (const r of data ?? []) {
      const wk = r.week_ending as string;
      if (!byWeek.has(wk)) byWeek.set(wk, empty());
      const a = byWeek.get(wk)!;
      a.driverCount += 1;
      const accumOne = (
        v: unknown,
        sumKey: "overallSum" | "dcrSum" | "podSum" | "cdfSum" | "dsbSum" | "cedSum",
        cntKey:
          | "overallCount"
          | "dcrCount"
          | "podCount"
          | "cdfCount"
          | "dsbCount"
          | "cedCount",
      ) => {
        if (v !== null && v !== undefined && typeof v === "number") {
          a[sumKey] += v;
          a[cntKey] += 1;
        }
      };
      accumOne(r.overall_score, "overallSum", "overallCount");
      accumOne(r.dcr, "dcrSum", "dcrCount");
      accumOne(r.pod, "podSum", "podCount");
      accumOne(r.cdf, "cdfSum", "cdfCount");
      accumOne(r.dsb, "dsbSum", "dsbCount");
      accumOne(r.ced, "cedSum", "cedCount");
    }

    const avg = (sum: number, count: number) =>
      count > 0 ? +(sum / count).toFixed(2) : null;

    const points: CompanyTrendPoint[] = [...byWeek.entries()]
      .map(([week_ending, a]) => ({
        week_ending,
        overall_score: avg(a.overallSum, a.overallCount),
        dcr: avg(a.dcrSum, a.dcrCount),
        pod: avg(a.podSum, a.podCount),
        cdf: avg(a.cdfSum, a.cdfCount),
        dsb: avg(a.dsbSum, a.dsbCount),
        ced: avg(a.cedSum, a.cedCount),
        driver_count: a.driverCount,
      }))
      .sort((a, b) => (a.week_ending < b.week_ending ? -1 : 1))
      .slice(-12); // newest 12 weeks
    return points;
  },
);

// =============================================================================
// SAFETY DASHBOARD QUERIES
// =============================================================================

export interface SafetyLeaderboardRow {
  driver_id: string;
  full_name: string;
  impacting_count: number;
  prior_impacting_count?: number;
}

export interface DashboardSafetyLeaderboards {
  windowDays: number; // 7
  fewest: SafetyLeaderboardRow[]; // top 5, low to high
  most: SafetyLeaderboardRow[]; // bottom 5, high to low
  mostImproved: SafetyLeaderboardRow[]; // top 3 by WoW drop
  eligibleCount: number;
}

/**
 * Safety leaderboards. Eligibility = drivers present in the latest scorecard
 * (i.e. they ran routes during the latest reporting week). Ranking metric
 * = impacting safety events in the last 7 days. Most improved compares
 * impacting counts in days 1-7 vs. days 8-14 — biggest week-over-week
 * drop wins. Drivers excluded if they had zero events both weeks
 * (no "improvement" to celebrate).
 */
export const getDashboardSafetyLeaderboards = cache(
  async (): Promise<DashboardSafetyLeaderboards> => {
    const supabase = await createClient();
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const w1Start = new Date(todayUtc.getTime() - 6 * 86_400_000);
    const w1End = new Date(todayUtc.getTime() + 86_400_000);
    const w2Start = new Date(todayUtc.getTime() - 13 * 86_400_000);
    const w2End = new Date(todayUtc.getTime() - 6 * 86_400_000);

    // 1. Eligible drivers: those in the latest scorecard week.
    const { data: latestWk } = await supabase
      .from("scorecards")
      .select("week_ending")
      .order("week_ending", { ascending: false })
      .limit(1);
    const latestWeek = latestWk?.[0]?.week_ending as string | undefined;
    if (!latestWeek) {
      return {
        windowDays: 7,
        fewest: [],
        most: [],
        mostImproved: [],
        eligibleCount: 0,
      };
    }

    const [scorecardsRes, eventsThisWeekRes, eventsPriorWeekRes, driversRes] =
      await Promise.all([
        supabase
          .from("scorecards")
          .select("driver_id")
          .eq("week_ending", latestWeek),
        supabase
          .from("safety_events")
          .select("driver_id, count")
          .eq("severity", "impacting")
          .gte("event_date", w1Start.toISOString())
          .lt("event_date", w1End.toISOString()),
        supabase
          .from("safety_events")
          .select("driver_id, count")
          .eq("severity", "impacting")
          .gte("event_date", w2Start.toISOString())
          .lt("event_date", w2End.toISOString()),
        supabase.from("drivers").select("id, full_name").eq("status", "active"),
      ]);

    const eligibleIds = new Set<string>();
    for (const r of scorecardsRes.data ?? []) {
      eligibleIds.add(r.driver_id as string);
    }
    const activeNameMap = new Map<string, string>();
    for (const d of driversRes.data ?? []) {
      activeNameMap.set(d.id as string, d.full_name as string);
    }

    const thisWeekByDriver = new Map<string, number>();
    for (const e of eventsThisWeekRes.data ?? []) {
      const id = e.driver_id as string;
      thisWeekByDriver.set(
        id,
        (thisWeekByDriver.get(id) ?? 0) + ((e.count as number) ?? 0),
      );
    }
    const priorWeekByDriver = new Map<string, number>();
    for (const e of eventsPriorWeekRes.data ?? []) {
      const id = e.driver_id as string;
      priorWeekByDriver.set(
        id,
        (priorWeekByDriver.get(id) ?? 0) + ((e.count as number) ?? 0),
      );
    }

    // Build the eligible row set: every active driver in the latest scorecard.
    const rows: SafetyLeaderboardRow[] = [];
    for (const id of eligibleIds) {
      const name = activeNameMap.get(id);
      if (!name) continue; // status != active, skip
      rows.push({
        driver_id: id,
        full_name: name,
        impacting_count: thisWeekByDriver.get(id) ?? 0,
        prior_impacting_count: priorWeekByDriver.get(id) ?? 0,
      });
    }

    const byCountAsc = [...rows].sort(
      (a, b) =>
        a.impacting_count - b.impacting_count ||
        a.full_name.localeCompare(b.full_name),
    );
    const byCountDesc = [...rows].sort(
      (a, b) =>
        b.impacting_count - a.impacting_count ||
        a.full_name.localeCompare(b.full_name),
    );
    const fewest = byCountAsc.slice(0, 5);
    // Bottom 5 only meaningful if there's at least one event somewhere
    const most = byCountDesc
      .filter((r) => r.impacting_count > 0)
      .slice(0, 5);

    // Most improved: drop = prior - this; positive drop wins.
    const improved = rows
      .map((r) => ({
        ...r,
        drop: (r.prior_impacting_count ?? 0) - r.impacting_count,
      }))
      .filter((r) => r.drop > 0)
      .sort(
        (a, b) =>
          b.drop - a.drop || a.full_name.localeCompare(b.full_name),
      )
      .slice(0, 3);

    return {
      windowDays: 7,
      fewest,
      most,
      mostImproved: improved,
      eligibleCount: rows.length,
    };
  },
);

export interface SafetyThresholdDriver {
  driver_id: string;
  full_name: string;
  impacting_count: number;
  non_impacting_count: number;
}

/**
 * Drivers crossing the safety-intervention threshold in the last 7 days:
 * 1+ impacting OR 4+ non-impacting. Used for the Safety tile #4 popover.
 */
export const getSafetyThresholdDrivers = cache(
  async (): Promise<SafetyThresholdDriver[]> => {
    const supabase = await createClient();
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const start = new Date(todayUtc.getTime() - 6 * 86_400_000);
    const endExclusive = new Date(todayUtc.getTime() + 86_400_000);

    const [eventsRes, driversRes] = await Promise.all([
      supabase
        .from("safety_events")
        .select("driver_id, severity, count")
        .gte("event_date", start.toISOString())
        .lt("event_date", endExclusive.toISOString()),
      supabase.from("drivers").select("id, full_name").eq("status", "active"),
    ]);

    const nameMap = new Map<string, string>();
    for (const d of driversRes.data ?? []) {
      nameMap.set(d.id as string, d.full_name as string);
    }

    const counts = new Map<string, { imp: number; nonImp: number }>();
    for (const e of eventsRes.data ?? []) {
      const id = e.driver_id as string;
      if (!counts.has(id)) counts.set(id, { imp: 0, nonImp: 0 });
      const c = counts.get(id)!;
      if (e.severity === "impacting") c.imp += (e.count as number) ?? 0;
      else c.nonImp += (e.count as number) ?? 0;
    }

    const out: SafetyThresholdDriver[] = [];
    for (const [id, c] of counts) {
      if (
        c.imp >= SAFETY_IMPACTING_THRESHOLD ||
        c.nonImp >= SAFETY_NON_IMPACTING_THRESHOLD
      ) {
        const name = nameMap.get(id);
        if (!name) continue;
        out.push({
          driver_id: id,
          full_name: name,
          impacting_count: c.imp,
          non_impacting_count: c.nonImp,
        });
      }
    }
    out.sort(
      (a, b) =>
        b.impacting_count - a.impacting_count ||
        b.non_impacting_count - a.non_impacting_count ||
        a.full_name.localeCompare(b.full_name),
    );
    return out;
  },
);

export interface QualityThresholdDriver {
  driver_id: string;
  full_name: string;
  issues: string[];
}

/**
 * Drivers breaking any quality threshold on their latest scorecard. Used
 * for the Quality tile #4 popover.
 */
export const getQualityThresholdDrivers = cache(
  async (): Promise<QualityThresholdDriver[]> => {
    const supabase = await createClient();
    const { data: latestWk } = await supabase
      .from("scorecards")
      .select("week_ending")
      .order("week_ending", { ascending: false })
      .limit(1);
    const latestWeek = latestWk?.[0]?.week_ending as string | undefined;
    if (!latestWeek) return [];

    const [scorecardsRes, driversRes] = await Promise.all([
      supabase
        .from("scorecards")
        .select("driver_id, dcr, pod, cdf, ced, dsb, dsb_count, psb")
        .eq("week_ending", latestWeek),
      supabase.from("drivers").select("id, full_name").eq("status", "active"),
    ]);

    const nameMap = new Map<string, string>();
    for (const d of driversRes.data ?? []) {
      nameMap.set(d.id as string, d.full_name as string);
    }

    const out: QualityThresholdDriver[] = [];
    for (const sc of scorecardsRes.data ?? []) {
      const id = sc.driver_id as string;
      const name = nameMap.get(id);
      if (!name) continue;
      const issues = evaluateScorecard(sc);
      if (issues.length === 0) continue;
      out.push({
        driver_id: id,
        full_name: name,
        issues: issues.map((i) => `${i.metric} ${i.value} (${i.threshold})`),
      });
    }
    out.sort(
      (a, b) =>
        b.issues.length - a.issues.length ||
        a.full_name.localeCompare(b.full_name),
    );
    return out;
  },
);

// =============================================================================
// SAFETY EVENT TYPE TREND (per-week, per-type, by severity)
// =============================================================================

export interface SafetyEventSeriesPoint {
  week_ending: string;
  by_type: Record<string, number>;
  total: number;
}

/**
 * Weekly counts per event_type for the safety company-trend chart. Returns
 * one point per Amazon week (Sun-Sat) for the last 12 weeks. event_date
 * gets bucketed to its Amazon-week end. Severity filter selects which
 * series to compute — chart caller switches between the two via toggle.
 */
export const getSafetyEventSeries = cache(
  async (
    severity: "impacting" | "non_impacting",
  ): Promise<SafetyEventSeriesPoint[]> => {
    const supabase = await createClient();
    const since = new Date(Date.now() - 12 * 7 * 86_400_000);
    const { data, error } = await supabase
      .from("safety_events")
      .select("event_date, event_type, count")
      .eq("severity", severity)
      .gte("event_date", since.toISOString());
    if (error) {
      console.error("getSafetyEventSeries failed:", error);
      return [];
    }

    // Compute Amazon-week ending (Sat) for a given event_date (timestamptz).
    const weekEndOf = (iso: string): string => {
      const d = new Date(iso);
      const utc = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      );
      const day = utc.getUTCDay(); // 0=Sun..6=Sat
      const daysUntilSat = (6 - day + 7) % 7;
      utc.setUTCDate(utc.getUTCDate() + daysUntilSat);
      return utc.toISOString().slice(0, 10);
    };

    const byWeek = new Map<string, Map<string, number>>();
    for (const e of data ?? []) {
      const wk = weekEndOf(e.event_date as string);
      const type = (e.event_type as string) ?? "Unknown";
      if (!byWeek.has(wk)) byWeek.set(wk, new Map());
      const m = byWeek.get(wk)!;
      m.set(type, (m.get(type) ?? 0) + ((e.count as number) ?? 0));
    }

    const points: SafetyEventSeriesPoint[] = [...byWeek.entries()]
      .map(([week_ending, m]) => {
        const by_type: Record<string, number> = {};
        let total = 0;
        for (const [t, c] of m) {
          by_type[t] = c;
          total += c;
        }
        return { week_ending, by_type, total };
      })
      .sort((a, b) => (a.week_ending < b.week_ending ? -1 : 1))
      .slice(-12);
    return points;
  },
);

// =============================================================================
// QUALITY DONUTS — CDF Negative & DSB (from concessions)
// =============================================================================

export interface DefectMix {
  rangeStart: string;
  rangeEnd: string;
  hasData: boolean;
  byType: { type: string; count: number }[];
  total: number;
}

/**
 * Window helper for Quality dashboard surfaces (CDF donut, DSB donut,
 * negative-CDF tile #2). Returns the Sun-Sat Amazon week containing the
 * **most recent delivery_date across cdf_negative and DSB-impacting
 * concessions**.
 *
 * Scorecards are intentionally NOT consulted here. Scorecards can land
 * for a week before the matching CDF / concessions data is uploaded (or
 * the user might have a preliminary in-progress scorecard from a partial
 * DSP Overview upload). If we picked the scorecard week, the donuts
 * could show "Week N" with no data while the user has Week N-1 CDF/DSB
 * data sitting right there. Better to follow each donut's own data
 * source — what you uploaded is what you see.
 *
 * Leaderboards continue to anchor to the latest scorecard week directly
 * (they need overall_score), so the donut and leaderboard subtitles may
 * name different weeks during scorecard-vs-defect upload gaps — each
 * surface labels its own week explicitly so there's no confusion.
 */
interface ScorecardWeekRange {
  /** YYYY-MM-DD Sunday */
  rangeStart: string;
  /** YYYY-MM-DD Saturday */
  rangeEnd: string;
  /** ISO timestamp at Sunday 00:00 UTC */
  startIso: string;
  /** ISO timestamp at Saturday+1 00:00 UTC (exclusive upper bound) */
  endExclusiveIso: string;
}
/** Compute the Sun-Sat week containing a given calendar day. */
function weekRangeContaining(yyyymmdd: string): ScorecardWeekRange {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilSat = (6 - day + 7) % 7;
  const end = new Date(d.getTime() + daysUntilSat * 86_400_000);
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const endExclusive = new Date(end.getTime() + 86_400_000);
  return {
    rangeStart: start.toISOString().slice(0, 10),
    rangeEnd: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
}
const getLatestScorecardWeekRange = cache(
  async (): Promise<ScorecardWeekRange | null> => {
    const supabase = await createClient();
    // For concessions we look at delivery_date (when the package shipped),
    // not concession_date (when Amazon filed the concession) — the donut
    // is about "defects on packages delivered this week" for coaching.
    // Restrict to impacts_dsb rows so the anchor matches the DSB donut's
    // filter exactly.
    const [cdfMax, concMax] = await Promise.all([
      supabase
        .from("cdf_negative")
        .select("delivery_date")
        .order("delivery_date", { ascending: false })
        .limit(1),
      supabase
        .from("concessions")
        .select("delivery_date")
        .eq("impacts_dsb", true)
        .not("delivery_date", "is", null)
        .order("delivery_date", { ascending: false })
        .limit(1),
    ]);

    const candidates: string[] = [];
    const cdfRaw = cdfMax.data?.[0]?.delivery_date as string | undefined;
    if (cdfRaw) candidates.push(cdfRaw.slice(0, 10));
    const concRaw = concMax.data?.[0]?.delivery_date as string | undefined;
    if (concRaw) candidates.push(concRaw.slice(0, 10));

    if (candidates.length === 0) return null;
    // Take the most recent calendar day across the two defect sources,
    // then expand to its Sun-Sat week.
    const latest = candidates.sort().at(-1)!;
    return weekRangeContaining(latest);
  },
);

/**
 * Negative CDF mix for the latest scorecard week. Aggregates feedback_types[]
 * from cdf_negative rows whose delivery_date falls in that Sun-Sat range.
 * A single row with multiple feedback types contributes to each type's bucket.
 */
export const getCdfNegativeMix = cache(async (): Promise<DefectMix> => {
  const supabase = await createClient();
  const range = await getLatestScorecardWeekRange();
  if (!range) {
    return {
      rangeStart: "",
      rangeEnd: "",
      hasData: false,
      byType: [],
      total: 0,
    };
  }
  const { rangeStart, rangeEnd, startIso, endExclusiveIso } = range;

  const { data, error } = await supabase
    .from("cdf_negative")
    .select("feedback_types, delivery_date")
    .gte("delivery_date", startIso)
    .lt("delivery_date", endExclusiveIso);

  if (error) {
    console.error("getCdfNegativeMix failed:", error);
    return {
      rangeStart,
      rangeEnd,
      hasData: false,
      byType: [],
      total: 0,
    };
  }

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const types = (r.feedback_types as string[]) ?? [];
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .filter((r) => r.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count || a.type.localeCompare(b.type),
    );
  const total = byType.reduce((s, r) => s + r.count, 0);
  return {
    rangeStart,
    rangeEnd,
    hasData: byType.length > 0,
    byType,
    total,
  };
});

/**
 * Distinct count of drivers with one or more cdf_negative rows in the
 * latest scorecard week. Drives the Quality tile #2. Same window as the
 * CDF donut so the tile count and the donut total match.
 */
export const getNegativeCdfDriverCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const range = await getLatestScorecardWeekRange();
  if (!range) return 0;

  const { data, error } = await supabase
    .from("cdf_negative")
    .select("driver_id")
    .gte("delivery_date", range.startIso)
    .lt("delivery_date", range.endExclusiveIso);

  if (error) {
    console.error("getNegativeCdfDriverCount failed:", error);
    return 0;
  }
  const ids = new Set<string>();
  for (const r of data ?? []) ids.add(r.driver_id as string);
  return ids.size;
});

/**
 * DSB defect mix for the latest scorecard week, sourced from concessions
 * filtered to `impacts_dsb = true`. Same window as the CDF donut so the
 * Quality dashboard's per-week story is consistent. Same DSB report
 * Amazon exposes separately — the data is already in our concessions
 * table, no separate import needed.
 */
export const getDsbMix = cache(async (): Promise<DefectMix> => {
  const supabase = await createClient();
  const range = await getLatestScorecardWeekRange();
  if (!range) {
    return {
      rangeStart: "",
      rangeEnd: "",
      hasData: false,
      byType: [],
      total: 0,
    };
  }
  const { rangeStart, rangeEnd, startIso, endExclusiveIso } = range;

  // Filter by delivery_date (when the package shipped) — that's the
  // operational week we care about for coaching, even though Amazon's
  // concession_date (when they filed) may be days/weeks later.
  const { data, error } = await supabase
    .from("concessions")
    .select("defect_types, delivery_date, impacts_dsb")
    .eq("impacts_dsb", true)
    .gte("delivery_date", startIso)
    .lt("delivery_date", endExclusiveIso);

  if (error) {
    console.error("getDsbMix failed:", error);
    return {
      rangeStart,
      rangeEnd,
      hasData: false,
      byType: [],
      total: 0,
    };
  }

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const types = (r.defect_types as string[]) ?? [];
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .filter((r) => r.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count || a.type.localeCompare(b.type),
    );
  const total = byType.reduce((s, r) => s + r.count, 0);
  return {
    rangeStart,
    rangeEnd,
    hasData: byType.length > 0,
    byType,
    total,
  };
});

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
  /** Rolling window start — 6 days before today (UTC). */
  rangeStart: string;
  /** Rolling window end — today (UTC). */
  rangeEnd: string;
  /** True when at least one event falls in the window. */
  hasData: boolean;
  impacting: { byType: { event_type: string; count: number }[]; total: number };
  nonImpacting: {
    byType: { event_type: string; count: number }[];
    total: number;
  };
}

/**
 * Aggregated safety events from the **rolling last 7 days** (today and the
 * 6 calendar days before it, UTC), split by severity for two donut charts.
 *
 * Designed for the daily upload workflow: each Netradyne CSV represents a
 * single day, and the donut shows whatever week of activity is on file.
 * If a couple of days haven't been uploaded yet, the window still spans 7
 * calendar days — it just contains fewer event rows.
 *
 * Per-type counts are sorted desc so the biggest slice / legend row is
 * first. Empty results render a friendly empty state with a link to Import.
 */
export const getSafetyEventMix = cache(async (): Promise<SafetyMix> => {
  const supabase = await createClient();

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Half-open window [start 00:00Z, end+1 00:00Z) — 7 days inclusive.
  const startInclusive = new Date(todayUtc.getTime() - 6 * 86_400_000);
  const endExclusive = new Date(todayUtc.getTime() + 86_400_000);

  const { data, error } = await supabase
    .from("safety_events")
    .select("event_type, severity, count")
    .gte("event_date", startInclusive.toISOString())
    .lt("event_date", endExclusive.toISOString());

  const rangeStart = startInclusive.toISOString().slice(0, 10);
  const rangeEnd = todayUtc.toISOString().slice(0, 10);

  if (error) {
    console.error("getSafetyEventMix failed:", error);
    return {
      rangeStart,
      rangeEnd,
      hasData: false,
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
  const hasData = impByType.length > 0 || nonByType.length > 0;
  return {
    rangeStart,
    rangeEnd,
    hasData,
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
      .select("id, driver_id, category", { count: "exact" })
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
  // Per-category coached sets: a driver only drops from a category's
  // needs list when there's a category-matching session in the window.
  // 'other' sessions don't clear anything. Pre-Pass-13 sessions all have
  // category='other' by default, so they show up here but don't suppress.
  const coachedSafetyIds = new Set<string>();
  const coachedQualityIds = new Set<string>();
  const coachedEscalationIds = new Set<string>();
  for (const s of sessionRows) {
    const id = s.driver_id as string;
    const cat = ((s as { category?: string }).category as string) ?? "other";
    if (cat === "safety") coachedSafetyIds.add(id);
    else if (cat === "quality") coachedQualityIds.add(id);
    else if (cat === "escalation") coachedEscalationIds.add(id);
  }

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
    if (coachedSafetyIds.has(e.driver_id)) continue;
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
      if (coachedQualityIds.has(sc.driver_id)) continue;
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
    if (coachedEscalationIds.has(e.driver_id as string)) continue;
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
  };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

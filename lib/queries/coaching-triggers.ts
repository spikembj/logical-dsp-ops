import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-driver "needs coaching" triggers — used both on the dashboard
 * (aggregated across drivers) and on the per-driver coaching tab.
 *
 * Anchor: 7-day rolling window from today.
 */

export const QUALITY_THRESHOLDS = {
  dcrMin: 99.0,
  podMin: 99.0,
  cdfMax: 800,
  cedMax: 0,
  // DSB DPMO is a defect rate (Defects Per Million Opportunities) — higher
  // means more defects per delivery volume, so over 233 triggers coaching.
  dsbDpmoMax: 233,
  // DSB Count is the raw number of DSB defects this week — any defect at
  // all is worth flagging.
  dsbCountMax: 0,
  psbMaxPct: 10,
} as const;

export interface SafetyTrigger {
  event_type: string;
  total_count: number;
}

export interface QualityTrigger {
  metric: string;
  value: number;
  threshold: string;
}

export interface EscalationTrigger {
  id: string;
  bucket: string | null;
  category: string | null;
  behavior: string;
  incident_date: string;
  ack_status: string | null;
}

export interface DriverCoachingTriggers {
  safety: SafetyTrigger[];
  quality: QualityTrigger[];
  escalations: EscalationTrigger[];
  hasSessionInWindow: boolean;
  windowDays: number;
}

interface ScorecardLite {
  dcr: number | null;
  pod: number | null;
  cdf: number | null;
  ced: number | null;
  dsb: number | null;
  dsb_count: number | null;
  psb: number | null;
}

export function evaluateScorecard(s: ScorecardLite): QualityTrigger[] {
  const out: QualityTrigger[] = [];
  if (s.dcr !== null && s.dcr < QUALITY_THRESHOLDS.dcrMin) {
    out.push({
      metric: "DCR",
      value: s.dcr,
      threshold: `< ${QUALITY_THRESHOLDS.dcrMin}%`,
    });
  }
  if (s.pod !== null && s.pod < QUALITY_THRESHOLDS.podMin) {
    out.push({
      metric: "POD",
      value: s.pod,
      threshold: `< ${QUALITY_THRESHOLDS.podMin}%`,
    });
  }
  if (s.cdf !== null && s.cdf > QUALITY_THRESHOLDS.cdfMax) {
    out.push({
      metric: "CDF DPMO",
      value: s.cdf,
      threshold: `> ${QUALITY_THRESHOLDS.cdfMax}`,
    });
  }
  if (s.ced !== null && s.ced > QUALITY_THRESHOLDS.cedMax) {
    out.push({ metric: "CED", value: s.ced, threshold: "≥ 1" });
  }
  if (s.dsb !== null && s.dsb > QUALITY_THRESHOLDS.dsbDpmoMax) {
    out.push({
      metric: "DSB DPMO",
      value: s.dsb,
      threshold: `> ${QUALITY_THRESHOLDS.dsbDpmoMax}`,
    });
  }
  if (s.dsb_count !== null && s.dsb_count > QUALITY_THRESHOLDS.dsbCountMax) {
    out.push({
      metric: "DSB Count",
      value: s.dsb_count,
      threshold: "≥ 1",
    });
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

export const getDriverCoachingTriggers = cache(
  async (driverId: string, windowDays = 7): Promise<DriverCoachingTriggers> => {
    const supabase = await createClient();
    const cutoffMs = Date.now() - windowDays * 86_400_000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const cutoffDate = cutoffIso.slice(0, 10);

    const [eventsRes, latestRes, sessionRes, escRes] = await Promise.all([
      supabase
        .from("safety_events")
        .select("event_type, count")
        .eq("driver_id", driverId)
        .eq("severity", "impacting")
        .gte("event_date", cutoffIso),
      supabase
        .from("scorecards")
        .select("dcr, pod, cdf, ced, dsb, dsb_count, psb, week_ending")
        .eq("driver_id", driverId)
        .order("week_ending", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("coaching_sessions")
        .select("id", { head: true, count: "exact" })
        .eq("driver_id", driverId)
        .gte("session_date", cutoffDate)
        .is("voided_at", null),
      // Open escalations: any non-"Yes" ack_status. Not bounded by window —
      // an unack'd escalation from any time is still open work.
      supabase
        .from("escalations")
        .select("id, bucket, category, behavior, incident_date, ack_status")
        .eq("driver_id", driverId)
        .order("incident_date", { ascending: false }),
    ]);

    const byType = new Map<string, SafetyTrigger>();
    for (const e of eventsRes.data ?? []) {
      const key = e.event_type as string;
      if (!byType.has(key))
        byType.set(key, { event_type: key, total_count: 0 });
      byType.get(key)!.total_count += (e.count as number) ?? 0;
    }

    const safety = [...byType.values()].sort(
      (a, b) => b.total_count - a.total_count,
    );
    const quality = latestRes.data
      ? evaluateScorecard(latestRes.data as ScorecardLite)
      : [];
    const escalations: EscalationTrigger[] = (escRes.data ?? [])
      .filter(
        (e) => ((e.ack_status as string | null) ?? "").trim().toLowerCase() !== "yes",
      )
      .map((e) => ({
        id: e.id as string,
        bucket: (e.bucket as string | null) ?? null,
        category: (e.category as string | null) ?? null,
        behavior: e.behavior as string,
        incident_date: e.incident_date as string,
        ack_status: (e.ack_status as string | null) ?? null,
      }));
    const hasSessionInWindow = (sessionRes.count ?? 0) > 0;

    return { safety, quality, escalations, hasSessionInWindow, windowDays };
  },
);

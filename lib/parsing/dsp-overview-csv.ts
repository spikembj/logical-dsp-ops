import "server-only";
import Papa from "papaparse";
import { amazonWeekEnding } from "@/lib/format/dates";
import type { Tier } from "@/lib/types/database";

/**
 * Parser for the Amazon DSP Overview Dashboard CSV.
 *
 * One row per driver per week. Columns include the same per-driver
 * metrics the scorecard PDF has, plus a per-driver Overall Standing
 * (Platinum/Gold/Silver/Bronze) and Overall Score (0–100), plus a
 * tier and score for every individual metric.
 *
 * "Week" column is in ISO-week-ish form: "2026-W17". We convert that
 * to an Amazon-week-ending Saturday using amazonWeekEnding(week, year).
 */

export interface ParsedDspOverviewDriver {
  full_name: string;
  transporter_id: string;
  week_ending: string; // YYYY-MM-DD
  week: number;
  year: number;
  tier: Tier | null;
  overall_score: number | null;
  delivered: number | null;
  fico_score: number | null;
  speeding_event_rate: number | null;
  seatbelt_off_rate: number | null;
  distractions_rate: number | null;
  sign_signal_violations_rate: number | null;
  following_distance_rate: number | null;
  cdf: number | null;
  ced: number | null;
  dcr: number | null;
  pod: number | null;
  dsb: number | null;
  psb: number | null;
  raw_row: Record<string, string>;
}

export interface ParsedDspOverviewReport {
  weeks_present: string[]; // distinct "2026-W17" strings observed
  drivers: ParsedDspOverviewDriver[];
}

const TIER_MAP: Record<string, Tier> = {
  // New (current) Amazon naming
  platinum: "platinum",
  gold: "gold",
  silver: "silver",
  bronze: "bronze",
  // Legacy naming (some weeks may still emit the old labels)
  "fantastic plus": "fantastic_plus",
  "fantastic+": "fantastic_plus",
  fantastic: "fantastic",
  great: "great",
  fair: "fair",
  poor: "poor",
};

function parseTier(s: string | undefined): Tier | null {
  if (!s) return null;
  const key = s.trim().toLowerCase();
  return TIER_MAP[key] ?? null;
}

function parseNumeric(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || /^no\s*data$/i.test(t)) return null;
  const cleaned = t.replace(/,/g, "").replace(/%$/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(s: string | undefined): number | null {
  const n = parseNumeric(s);
  return n === null ? null : Math.round(n);
}

/** "2026-W17" → { week: 17, year: 2026 } */
function parseWeekString(s: string): { week: number; year: number } {
  const m = s.match(/^(\d{4})-W(\d+)$/);
  if (!m) throw new Error(`Could not parse Week column "${s}".`);
  return { year: Number(m[1]), week: Number(m[2]) };
}

/**
 * Some CSV header cells include trailing whitespace (e.g. "Delivery
 * Associate "). Resolve a row-key by trying exact then trimmed variants.
 */
function pickField(row: Record<string, string>, ...candidates: string[]) {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const trimmed = c.trim();
    if (row[trimmed] !== undefined) return row[trimmed];
  }
  // Fall back: scan all keys with trim+lowercase comparison.
  const wanted = candidates[0]!.trim().toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === wanted) return row[k];
  }
  return undefined;
}

export function parseDspOverviewCsv(text: string): ParsedDspOverviewReport {
  // Strip BOM if present (Amazon exports often have one).
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn(
      "DSP overview CSV parse warnings:",
      result.errors.slice(0, 3),
    );
  }

  const drivers: ParsedDspOverviewDriver[] = [];
  const weeksSet = new Set<string>();

  for (const row of result.data) {
    const weekStr = pickField(row, "Week");
    const tid = pickField(row, "Transporter ID");
    const name = pickField(row, "Delivery Associate", "Delivery Associate ");
    if (!weekStr || !tid || !name) continue;

    const trimmedTid = tid.trim();
    const trimmedName = name.trim();
    if (!/^A[A-Z0-9]{10,18}$/.test(trimmedTid)) continue;

    const { week, year } = parseWeekString(weekStr.trim());
    const week_ending = amazonWeekEnding(week, year);
    weeksSet.add(weekStr.trim());

    drivers.push({
      full_name: trimmedName,
      transporter_id: trimmedTid,
      week_ending,
      week,
      year,
      tier: parseTier(pickField(row, "Overall Standing")),
      overall_score: parseNumeric(pickField(row, "Overall Score")),
      delivered: parseInteger(pickField(row, "Packages Delivered")),
      fico_score: parseInteger(pickField(row, "FICO Metric")),
      speeding_event_rate: parseNumeric(
        pickField(row, "Speeding Event Rate (per trip)"),
      ),
      seatbelt_off_rate: parseNumeric(
        pickField(row, "Seatbelt-Off Rate (per trip)"),
      ),
      distractions_rate: parseNumeric(
        pickField(row, "Distractions Rate (per trip)"),
      ),
      sign_signal_violations_rate: parseNumeric(
        pickField(row, "Sign/ Signal Violations Rate (per trip)"),
      ),
      following_distance_rate: parseNumeric(
        pickField(row, "Following Distance Rate (per trip)"),
      ),
      cdf: parseInteger(pickField(row, "CDF DPMO")),
      ced: parseInteger(pickField(row, "CED")),
      dcr: parseNumeric(pickField(row, "DCR")),
      pod: parseNumeric(pickField(row, "POD")),
      dsb: parseInteger(pickField(row, "DSB")),
      psb: parseNumeric(pickField(row, "PSB")),
      raw_row: row,
    });
  }

  if (drivers.length === 0) {
    throw new Error(
      "Parsed CSV but found no driver rows. Are the column names what we expect?",
    );
  }

  return {
    weeks_present: [...weeksSet].sort(),
    drivers,
  };
}

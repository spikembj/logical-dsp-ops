import "server-only";
import Papa from "papaparse";

/**
 * Parser for the Amazon Escalations / Infractions Report CSV.
 *
 * Standard header CSV, one row per individual incident:
 *   country, station, dsp, driver_transporter_id, da_name,
 *   total_defects_in_the_last_120_days, bucket, category, behavior,
 *   scorecard_week, incident_date, dsp_notification_date,
 *   dsp_appealed_or_da_coaching_retraining_ack, week, year
 */

export interface ParsedEscalation {
  full_name: string;
  transporter_id: string;
  country: string | null;
  station_code: string | null;
  dsp_name: string | null;
  bucket: string | null;
  category: string | null;
  behavior: string;
  incident_date: string; // YYYY-MM-DD
  dsp_notification_date: string | null;
  ack_status: string | null;
  scorecard_week: string | null;
  total_defects_120d: number | null;
  raw_row: Record<string, string>;
}

export interface ParsedEscalationsReport {
  drivers_in_report: number; // distinct
  escalations: ParsedEscalation[];
}

function blank(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function parseInt32(s: string | undefined): number | null {
  const t = blank(s);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pick(row: Record<string, string>, key: string): string | undefined {
  if (row[key] !== undefined) return row[key];
  // Tolerate small header drift (case, trailing space).
  const want = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === want) return row[k];
  }
  return undefined;
}

export function parseEscalationsCsv(text: string): ParsedEscalationsReport {
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn("Escalations CSV parse warnings:", result.errors.slice(0, 3));
  }

  const escalations: ParsedEscalation[] = [];
  const driverIds = new Set<string>();

  for (const row of result.data) {
    const tid = blank(pick(row, "driver_transporter_id"));
    const name = blank(pick(row, "da_name"));
    const incidentDate = blank(pick(row, "incident_date"));
    const behavior = blank(pick(row, "behavior"));
    if (!tid || !name || !incidentDate || !behavior) continue;
    if (!/^A[A-Z0-9]{10,18}$/.test(tid)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) continue;

    driverIds.add(tid);
    escalations.push({
      full_name: name,
      transporter_id: tid,
      country: blank(pick(row, "country")),
      station_code: blank(pick(row, "station")),
      dsp_name: blank(pick(row, "dsp")),
      bucket: blank(pick(row, "bucket")),
      category: blank(pick(row, "category")),
      behavior,
      incident_date: incidentDate,
      dsp_notification_date: blank(pick(row, "dsp_notification_date")),
      ack_status: blank(pick(row, "dsp_appealed_or_da_coaching_retraining_ack")),
      scorecard_week: blank(pick(row, "scorecard_week")),
      total_defects_120d: parseInt32(
        pick(row, "total_defects_in_the_last_120_days"),
      ),
      raw_row: row,
    });
  }

  if (escalations.length === 0) {
    throw new Error(
      "Parsed CSV but found no valid escalation rows. Are the required columns (driver_transporter_id, da_name, incident_date, behavior) present?",
    );
  }

  return {
    drivers_in_report: driverIds.size,
    escalations,
  };
}

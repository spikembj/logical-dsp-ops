import "server-only";
import Papa from "papaparse";

/**
 * Parser for the DSP Customer Delivery Feedback (Negative) CSV.
 *
 * One row per individual customer complaint. The same parser handles both
 * the weekly export and the daily export — they have identical headers,
 * just different row counts.
 */

export interface ParsedCdfNegative {
  full_name: string;
  transporter_id: string;
  tracking_id: string;
  delivery_group_id: string | null;
  delivery_date: string;          // ISO timestamp
  feedback_details: string | null;
  feedback_types: string[];
  raw_row: Record<string, string>;
}

export interface ParsedCdfNegativeReport {
  drivers_in_report: number;
  rows: ParsedCdfNegative[];
}

const FLAG_COLUMNS = [
  "DA Mishandled Package",
  "DA was Unprofessional",
  "DA did not follow my delivery instructions",
  "Delivered to Wrong Address",
  "Never Received Delivery",
  "Received Wrong Item",
] as const;

function blank(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function parseTs(s: string | undefined): string | null {
  const t = blank(s);
  if (!t) return null;
  const iso = t.includes("T") ? t : t.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pick(row: Record<string, string>, key: string): string | undefined {
  if (row[key] !== undefined) return row[key];
  const want = key.toLowerCase().trim();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === want) return row[k];
  }
  return undefined;
}

export function parseCdfNegativeCsv(text: string): ParsedCdfNegativeReport {
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn("CDF Negative CSV parse warnings:", result.errors.slice(0, 3));
  }

  const rows: ParsedCdfNegative[] = [];
  const driverIds = new Set<string>();

  for (const row of result.data) {
    const tid = blank(pick(row, "Delivery Associate"));
    const name = blank(pick(row, "Delivery Associate Name"));
    const trackingId = blank(pick(row, "Tracking ID"));
    const deliveryDate = parseTs(pick(row, "Delivery Date"));
    if (!tid || !name || !trackingId || !deliveryDate) continue;
    if (!/^A[A-Z0-9]{10,18}$/.test(tid)) continue;

    const flags: string[] = [];
    for (const col of FLAG_COLUMNS) {
      if ((pick(row, col) ?? "").trim() === "1") flags.push(col);
    }

    driverIds.add(tid);
    rows.push({
      full_name: name,
      transporter_id: tid,
      tracking_id: trackingId,
      delivery_group_id: blank(pick(row, "Delivery Group ID")),
      delivery_date: deliveryDate,
      feedback_details: blank(pick(row, "Feedback Details")),
      feedback_types: flags,
      raw_row: row,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      "Parsed CSV but found no valid CDF rows. Check the column headers match the standard report.",
    );
  }

  return { drivers_in_report: driverIds.size, rows };
}

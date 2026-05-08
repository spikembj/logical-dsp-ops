import "server-only";
import Papa from "papaparse";

/**
 * Parser for the DSP Delivery Concessions CSV.
 *
 * Standard header CSV (with BOM). Each row is one package concession.
 * The defect-type columns are 0/1 flags — multiple may be set. We
 * collect the set ones into a defect_types[] for easy display/filter.
 */

export interface ParsedConcession {
  full_name: string;
  transporter_id: string;
  tracking_id: string;
  concession_date: string;            // ISO timestamp
  pickup_date: string | null;
  delivery_attempt_date: string | null;
  delivery_date: string | null;
  delivery_type: string | null;
  service_area: string | null;
  dsp_name: string | null;
  impacts_dsb: boolean;
  defect_types: string[];
  raw_row: Record<string, string>;
}

export interface ParsedConcessionsReport {
  drivers_in_report: number;
  concessions: ParsedConcession[];
}

const FLAG_COLUMNS = [
  "Simultaneous Deliveries",
  "Delivered > 50 m",
  "Incorrect Scan Usage - Attended Delivery",
  "Incorrect Scan Usage - Unattended Delivery",
  "No POD on Delivery",
  "Scanned - Not Delivered - Not Returned",
] as const;

function blank(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function parseTs(s: string | undefined): string | null {
  const t = blank(s);
  if (!t) return null;
  // Source format: "2026-04-25 19:17:10" — interpret as UTC ISO. The
  // Concession Date is already in fleet-local time per Amazon's report,
  // but for our purposes treating it as UTC is good enough; we display
  // by date only.
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

export function parseConcessionsCsv(text: string): ParsedConcessionsReport {
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn("Concessions CSV parse warnings:", result.errors.slice(0, 3));
  }

  const concessions: ParsedConcession[] = [];
  const driverIds = new Set<string>();

  for (const row of result.data) {
    const tid = blank(pick(row, "Delivery Associate"));
    const name = blank(pick(row, "Delivery Associate Name"));
    const trackingId = blank(pick(row, "Tracking ID"));
    const concessionDate = parseTs(pick(row, "Concession Date"));
    if (!tid || !name || !trackingId || !concessionDate) continue;
    if (!/^A[A-Z0-9]{10,18}$/.test(tid)) continue;

    const flags: string[] = [];
    for (const col of FLAG_COLUMNS) {
      if ((pick(row, col) ?? "").trim() === "1") flags.push(col);
    }

    driverIds.add(tid);
    concessions.push({
      full_name: name,
      transporter_id: tid,
      tracking_id: trackingId,
      concession_date: concessionDate,
      pickup_date: parseTs(pick(row, "Pickup Date")),
      delivery_attempt_date: parseTs(pick(row, "Delivery Attempt Date")),
      delivery_date: parseTs(pick(row, "Delivery Date")),
      delivery_type: blank(pick(row, "Delivery Type")),
      service_area: blank(pick(row, "Service Area")),
      dsp_name: blank(pick(row, "DSP")),
      impacts_dsb: (pick(row, "Impacts DSB") ?? "").trim() === "1",
      defect_types: flags,
      raw_row: row,
    });
  }

  if (concessions.length === 0) {
    throw new Error(
      "Parsed CSV but found no valid concession rows. Check the column names match the standard report.",
    );
  }

  return {
    drivers_in_report: driverIds.size,
    concessions,
  };
}

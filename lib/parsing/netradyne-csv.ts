import "server-only";
import Papa from "papaparse";
import { parse as parseDate, format as formatDate } from "date-fns";

/**
 * Parser for Netradyne aggregated event reports (CSV).
 *
 * The CSV starts with ~9 lines of metadata (Fleet, Duration, Risk Level, etc.),
 * a blank line or two, then the real header row that begins with "Driver Name".
 * Each subsequent row is one driver, with integer counts for each event type
 * across the reporting period.
 *
 * What we extract per driver:
 *   - name (Driver Name)
 *   - id (Driver ID — Netradyne's internal ID; we don't store it, only use
 *         it for tie-breaking if name lookups are ambiguous)
 *   - events: a record mapping event_type → count for non-zero entries
 */

export type Severity = "impacting" | "non_impacting";

/**
 * Per-spec severity classification, plus best-effort defaults for the
 * additional Netradyne columns that the spec doesn't explicitly mention.
 *
 * Keys must match the column header text from the CSV exactly.
 */
export const EVENT_CLASSIFICATION: Record<string, Severity> = {
  // Impacting (per spec) — the metrics that should trigger coaching.
  "Sign Violations": "impacting",
  "Traffic Light Violation": "impacting",
  "Speeding Violations": "impacting",
  "Driver Distraction": "impacting",
  "Seatbelt Compliance": "impacting",
  "Camera Obstruction": "impacting",
  "Following Distance": "impacting",
  "Roadside Parking": "impacting",

  // Non-impacting (per spec).
  "High - G": "non_impacting",
  "Hard Braking": "non_impacting",
  "Hard Turn": "non_impacting",
  "Hard Acceleration": "non_impacting",
  "Driver Drowsiness": "non_impacting",
  Weaving: "non_impacting",
  Backing: "non_impacting",

  // Extra columns the spec doesn't enumerate. Defaulting non-impacting so
  // they don't auto-trigger coaching; raw counts are still preserved.
  "Low Impact": "non_impacting",
  "Driver Initiated": "non_impacting",
  "Potential Collision": "non_impacting",
  "U Turn": "non_impacting",
  "Collision Warning": "non_impacting",
  "Requested Video": "non_impacting",
  "Cabin Object": "non_impacting",
  "Lane Conduct": "non_impacting",
};

/** Columns to ignore — these are summary/context, not event counts. */
const IGNORED_COLUMNS = new Set([
  "Driver Name",
  "Driver ID",
  "Minutes Analyzed",
  "Green Minutes%",
  "Over Speeding%",
  "Average Following Distance",
  "Driver Score",
  "Driver Star",
  "Total Events",
]);

export interface ParsedNetradyneDriver {
  full_name: string;
  netradyne_id: string;
  events: Array<{
    event_type: string;
    severity: Severity;
    count: number;
  }>;
  raw_row: Record<string, string>;
}

export interface ParsedNetradyneReport {
  fleet_name: string | null;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  total_events: number | null; // header total, for sanity
  drivers: ParsedNetradyneDriver[];
  /** Event-type column names actually present in the CSV (in CSV order). */
  event_columns: string[];
}

/** Parse "01-Apr-2026" → "2026-04-01". */
function parseHeaderDate(s: string): string {
  const d = parseDate(s.trim(), "dd-MMM-yyyy", new Date());
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Could not parse date "${s}" (expected DD-MMM-YYYY).`);
  }
  return formatDate(d, "yyyy-MM-dd");
}

export function parseNetradyneCsv(text: string): ParsedNetradyneReport {
  const lines = text.split(/\r?\n/);

  // Find the data header row — the line that starts with "Driver Name,".
  const headerIdx = lines.findIndex((l) => /^Driver Name\s*,/.test(l));
  if (headerIdx === -1) {
    throw new Error(
      'Could not locate the "Driver Name" header row. Is this a Netradyne export?',
    );
  }

  // Pull metadata from the prefix lines (key in column 1, value in column 2).
  let fleetName: string | null = null;
  let durationRaw: string | null = null;
  let totalEvents: number | null = null;
  for (const line of lines.slice(0, headerIdx)) {
    if (!line.trim()) continue;
    // Lines look like: ",Fleet Name,LGCL"  → ["", "Fleet Name", "LGCL"]
    const parsed = Papa.parse<string[]>(line, { header: false });
    const cells = parsed.data[0] ?? [];
    const key = (cells[1] ?? "").trim();
    const val = (cells[2] ?? "").trim();
    if (!key) continue;
    if (/^Fleet Name$/i.test(key)) fleetName = val || null;
    else if (/^Duration$/i.test(key)) durationRaw = val || null;
    else if (/^Total Events$/i.test(key)) {
      const n = Number(val);
      if (Number.isFinite(n)) totalEvents = n;
    }
  }

  if (!durationRaw) {
    throw new Error(
      "Could not locate Duration metadata in the CSV (expected line beginning with `,Duration,`).",
    );
  }
  const m = durationRaw.match(/^(.+?)\s+to\s+(.+)$/);
  if (!m) {
    throw new Error(`Could not parse Duration "${durationRaw}".`);
  }
  const periodStart = parseHeaderDate(m[1]);
  const periodEnd = parseHeaderDate(m[2]);

  // Now parse the data table starting from headerIdx.
  const dataCsv = lines.slice(headerIdx).join("\n");
  const result = Papa.parse<Record<string, string>>(dataCsv, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    // Don't fail outright — Papa is forgiving. Just log.
    console.warn("Netradyne CSV had parse warnings:", result.errors.slice(0, 3));
  }

  // Determine which columns are event columns (everything except IGNORED).
  const headerFields =
    result.meta.fields ??
    Object.keys(result.data[0] ?? {});
  const eventColumns = headerFields.filter((f) => !IGNORED_COLUMNS.has(f));

  const drivers: ParsedNetradyneDriver[] = [];
  for (const row of result.data) {
    const name = (row["Driver Name"] || "").trim();
    const id = (row["Driver ID"] || "").trim();
    if (!name || !id) continue;

    const events: ParsedNetradyneDriver["events"] = [];
    for (const col of eventColumns) {
      const raw = (row[col] ?? "").toString().trim();
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) continue;
      const severity = EVENT_CLASSIFICATION[col] ?? "non_impacting";
      events.push({ event_type: col, severity, count: Math.round(n) });
    }

    drivers.push({
      full_name: name,
      netradyne_id: id,
      events,
      raw_row: row,
    });
  }

  if (drivers.length === 0) {
    throw new Error(
      "Parsed CSV but found no driver rows. The format may have changed.",
    );
  }

  return {
    fleet_name: fleetName,
    period_start: periodStart,
    period_end: periodEnd,
    total_events: totalEvents,
    drivers,
    event_columns: eventColumns,
  };
}

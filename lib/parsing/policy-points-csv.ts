import "server-only";
import Papa from "papaparse";

/**
 * Parses the dispatcher's "POLICY POINTS" CSV — a historical log of
 * write-ups with no header row. Columns:
 *
 *   1. date            "M/D" (year inferred from current date)
 *   2. first_name      Sometimes has trailing whitespace
 *   3. last_name       May be empty for single-name entries
 *   4. category_label  e.g. "No Call No Show", "Van Damage"
 *   5. action_level    "write up" | "record only" (or blank)
 *   6. description     Free text — may contain commas (CSV-quoted)
 *   7. consequence     Optional — e.g. "Loss of Days", "Reduced Shifts"
 *   8. training        Optional — e.g. "Speeding Quiz"
 *
 * One-off backfill source — we filter to the last 90 days during import
 * (matching the user's stated retention policy for active discipline).
 */

export interface ParsedPolicyPoint {
  /** ISO date YYYY-MM-DD inferred from M/D + current year (with rollback
   *  to previous year for dates that would otherwise be in the future). */
  date: string;
  first_name: string;
  last_name: string;
  /** Snake-case category enum value, or null if the CSV label was
   *  unrecognized (caller treats unknown as 'other'). */
  category: PolicyPointCategory | null;
  /** Original CSV category text, kept for the import result card. */
  category_label_raw: string;
  /** Snake-case session_type derived from "write up" / "record only". */
  session_type: PolicyPointSessionType;
  /** Original CSV value, for the result card. */
  action_level_raw: string;
  description: string;
  consequence: string | null;
  training: string | null;
  /** 1-based CSV row index, for error reporting. */
  row_index: number;
}

export type PolicyPointCategory =
  | "same_day_call_off"
  | "no_call_no_show"
  | "abandon_route"
  | "safety_concern"
  | "quality_issue"
  | "behavior_issue"
  | "van_damage"
  | "property_damage"
  | "slept_in"
  | "quit"
  | "unable_to_finish"
  | "other";

export type PolicyPointSessionType =
  | "write_up"
  | "discussion" // mapped from "record only"
  | "verbal_warning";

const CATEGORY_MAP: Record<string, PolicyPointCategory> = {
  "same day call off": "same_day_call_off",
  "no call no show": "no_call_no_show",
  "abandon route": "abandon_route",
  "safety concern": "safety_concern",
  "quality issue": "quality_issue",
  "behavior issue": "behavior_issue",
  "van damage": "van_damage",
  "property damage": "property_damage",
  "slept in": "slept_in",
  "slept in.": "slept_in",
  quit: "quit",
  "unable to finish in timely manner": "unable_to_finish",
  "unable to finish": "unable_to_finish",
};

function mapCategory(raw: string): PolicyPointCategory | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CATEGORY_MAP[key] ?? null;
}

function mapSessionType(raw: string): PolicyPointSessionType {
  const key = raw.trim().toLowerCase();
  if (key === "record only") return "discussion";
  if (key === "warning" || key === "verbal warning") return "verbal_warning";
  // Default to write_up — the CSV uses "write up" most often and we'd
  // rather over-attribute severity than under-attribute.
  return "write_up";
}

/**
 * Parse "M/D" into ISO YYYY-MM-DD. Year inference: assume current
 * year; if the resulting date is in the future, roll back to last
 * year. This handles a mid-year CSV like "11/4" (= last November)
 * vs "3/15" (= this March).
 */
export function inferIsoDate(
  raw: string,
  today: Date = new Date(),
): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const month = parseInt(m[1]!, 10);
  const day = parseInt(m[2]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = today.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface ParsedPolicyPoints {
  /** Rows that parsed cleanly and fall within the date window. */
  rows: ParsedPolicyPoint[];
  /** Rows skipped before the date filter (bad format, missing names). */
  skipped: { row_index: number; reason: string; raw: string[] }[];
  /** Rows that parsed but fell outside the date window. */
  skipped_old_count: number;
}

export function parsePolicyPointsCsv(
  text: string,
  opts: { windowDays?: number; today?: Date } = {},
): ParsedPolicyPoints {
  const windowDays = opts.windowDays ?? 90;
  const today = opts.today ?? new Date();
  const earliest = new Date(today.getTime() - windowDays * 86400_000);

  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });

  const rows: ParsedPolicyPoint[] = [];
  const skipped: ParsedPolicyPoints["skipped"] = [];
  let skippedOld = 0;

  (parsed.data as string[][]).forEach((cols, idx) => {
    const rowIndex = idx + 1;
    if (cols.length < 4) {
      skipped.push({
        row_index: rowIndex,
        reason: "too few columns",
        raw: cols,
      });
      return;
    }
    const iso = inferIsoDate(cols[0] ?? "", today);
    if (!iso) {
      skipped.push({
        row_index: rowIndex,
        reason: `unparseable date "${cols[0]}"`,
        raw: cols,
      });
      return;
    }
    const dateObj = new Date(`${iso}T00:00:00Z`);
    if (dateObj < earliest) {
      skippedOld++;
      return;
    }
    const first = (cols[1] ?? "").trim();
    const last = (cols[2] ?? "").trim();
    if (!first && !last) {
      skipped.push({
        row_index: rowIndex,
        reason: "missing driver name",
        raw: cols,
      });
      return;
    }
    rows.push({
      date: iso,
      first_name: first,
      last_name: last,
      category: mapCategory(cols[3] ?? ""),
      category_label_raw: (cols[3] ?? "").trim(),
      session_type: mapSessionType(cols[4] ?? ""),
      action_level_raw: (cols[4] ?? "").trim(),
      description: (cols[5] ?? "").trim(),
      consequence: (cols[6] ?? "").trim() || null,
      training: (cols[7] ?? "").trim() || null,
      row_index: rowIndex,
    });
  });

  return { rows, skipped, skipped_old_count: skippedOld };
}

/**
 * Build the coaching_sessions topic + notes from a parsed CSV row.
 * Topic = the human-readable category label (or a fallback). Notes =
 * description + consequence + training, joined with separators so the
 * dispatcher reviewing the historical session has all the context.
 */
export function topicAndNotesFor(
  row: ParsedPolicyPoint,
): { topic: string; notes: string } {
  const topic = row.category_label_raw || "Write-up";
  const parts: string[] = [];
  if (row.description) parts.push(row.description);
  if (row.consequence) parts.push(`Consequence: ${row.consequence}`);
  if (row.training) parts.push(`Training assigned: ${row.training}`);
  return { topic, notes: parts.join("\n\n") };
}

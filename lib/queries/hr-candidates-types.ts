/**
 * Types + pure helpers for the HR candidates module. Client components
 * can import these without dragging the server-only query module into
 * the browser bundle.
 */

/** All allowed colors for a candidate status chip. Matches the DB
 *  CHECK constraint on candidate_statuses.color exactly — keep these
 *  two in sync if one changes. */
export const CANDIDATE_STATUS_COLORS = [
  "slate",
  "sky",
  "blue",
  "indigo",
  "purple",
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "emerald",
  "teal",
] as const;

export type CandidateStatusColor = (typeof CANDIDATE_STATUS_COLORS)[number];

/**
 * Tailwind classes for each color. Tuned for legibility in light AND
 * dark mode, with a slight punch that matches the chunky pill style
 * from the user's spreadsheet screenshot.
 */
export const CANDIDATE_STATUS_CHIP_CLASSES: Record<CandidateStatusColor, string> = {
  slate:
    "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  sky:
    "bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100",
  blue:
    "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100",
  indigo:
    "bg-indigo-200 text-indigo-900 dark:bg-indigo-800 dark:text-indigo-100",
  purple:
    "bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100",
  pink:
    "bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100",
  rose:
    "bg-rose-200 text-rose-900 dark:bg-rose-800 dark:text-rose-100",
  red:
    "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100",
  orange:
    "bg-orange-200 text-orange-900 dark:bg-orange-800 dark:text-orange-100",
  amber:
    "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100",
  emerald:
    "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100",
  teal:
    "bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100",
};

/** A small swatch (no text) — used in the color picker. */
export const CANDIDATE_STATUS_SWATCH_CLASSES: Record<CandidateStatusColor, string> = {
  slate: "bg-slate-400",
  sky: "bg-sky-400",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-400",
  rose: "bg-rose-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
};

export interface CandidateStatusRow {
  id: string;
  name: string;
  color: CandidateStatusColor;
  sort_order: number;
  treat_as_declined: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CandidateRow {
  id: string;
  status_id: string;
  full_name: string;
  phone_digits: string | null;
  phone_display: string | null;
  email: string | null;
  /** ISO timestamp or null. */
  interview_dt: string | null;
  interview_dsp: string | null;
  source: string | null;
  notes: string | null;
  archived_at: string | null;
  converted_driver_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * A candidate row plus the pre-joined info we need to render a card
 * without a second lookup, and the previously-declined flag we
 * computed at query time.
 */
export interface CandidateListItem extends CandidateRow {
  status_name: string;
  status_color: CandidateStatusColor;
  /**
   * True when this candidate's phone matches a prior candidate whose
   * status had `treat_as_declined=true` and is older than this one.
   * Only the current row gets flagged — the historical one does not.
   */
  previously_declined: boolean;
  /**
   * ISO date string of the most recent prior decline, if
   * previously_declined is true. Used to display "Previously declined
   * Jan 4, 2026" in the UI.
   */
  previously_declined_at: string | null;
  /** id of the prior declined candidate (so HR can click into it). */
  previously_declined_id: string | null;
}

/** Format a 10-digit phone string as "(801) 577-9123". Returns the
 *  original string if it does not look like 10 digits. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const d = digits.replace(/[^0-9]/g, "");
  if (d.length !== 10) return digits;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Normalize a typed phone for client-side dedup queries before save.
 *  Mirrors the DB's `normalize_phone()` — keep them in sync. */
export function normalizePhoneClient(p: string | null | undefined): string | null {
  if (!p) return null;
  const all = p.replace(/[^0-9]/g, "");
  if (all.length === 11 && all.startsWith("1")) return all.slice(1);
  return all || null;
}

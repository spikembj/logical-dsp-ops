/**
 * Types + pure helpers for Daily Ops. Kept separate from
 * `daily-ops.ts` (which is server-only) so client components can pull
 * these in without dragging the server module into the browser bundle.
 */

export interface WaveTime {
  wave: number;
  show_time: string; // 'HH:MM:SS' (Postgres time) or 'HH:MM'
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyRosterRow {
  id: string;
  date: string; // YYYY-MM-DD
  driver_id: string;
  vehicle_id: string;
  wave: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Fully-joined roster row with the bits the UI needs to render without
 * a second lookup.
 */
export interface DailyRosterEntry extends DailyRosterRow {
  driver_name: string;
  vehicle_name: string | null;
  vehicle_vin: string;
  show_time: string; // joined from wave_times
}

/**
 * "HH:MM" with no seconds, no AM/PM. Postgres `time` round-trips as
 * "HH:MM:SS" (or sometimes "HH:MM"); strip the seconds for display.
 */
export function formatShowTime(t: string): string {
  return t.slice(0, 5);
}

export interface DailyReportRow {
  id: string;
  date: string;
  dispatchers: string[]; // uuid[] of users.id
  routes_total: number | null;
  routes_reduced: number | null;
  routes_recycled: number | null;
  routes_ad_hocs: number | null;
  camera_hits: number | null;
  drivers_after_8pm: string[]; // uuid[] of drivers.id
  injuries_incidents: string | null;
  operational_vans_next_day: number | null;
  operational_phones_next_day: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** A vehicle_issues row tagged source='eod'. Joined with the van name. */
export interface EodVanNote {
  id: string;
  vehicle_id: string;
  description: string;
  created_at: string;
  vehicle_name: string;
  vehicle_vin: string;
}

// ---------------------------------------------------------------------------
// Duties checklist
// ---------------------------------------------------------------------------

export type DutiesCadence = "daily" | "weekly" | "monthly";

/**
 * Which surface owns the checklist item.
 *   ops — /duties (dispatch + ops mgmt; the original module)
 *   hr  — /hr/duties (HR + ops mgmt only; invisible to dispatchers)
 *
 * Backed by the `scope` column on duties_template_items. The same
 * underlying tables / queries / actions serve both surfaces; the only
 * difference is the filter. duties_completion has no scope — it joins
 * through template_item_id which carries the scope.
 */
export type DutiesScope = "ops" | "hr";

/** Sub-group within a daily checklist, or null for weekly/monthly. */
export type DutiesGroup =
  | "preload_out"
  | "load_out"
  | "post_load_out"
  | "rts"
  | "closing"
  | null;

export interface DutiesTemplateItem {
  id: string;
  scope: DutiesScope;
  cadence: DutiesCadence;
  group_label: DutiesGroup;
  owner_label: string;
  description: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DutiesCompletion {
  id: string;
  template_item_id: string;
  period_key: string;
  completed_at: string;
  completed_by: string | null;
}

/** A template item joined with its completion (if any) for a given period. */
export interface DutiesItemWithCompletion extends DutiesTemplateItem {
  completion: DutiesCompletion | null;
}

export const DUTIES_GROUP_LABELS: Record<NonNullable<DutiesGroup>, string> = {
  preload_out: "Preload out",
  load_out: "Load out",
  post_load_out: "Post load out",
  rts: "Return to station",
  closing: "Closing",
};

/** Ordering for daily groups in the UI. */
export const DUTIES_GROUP_ORDER: NonNullable<DutiesGroup>[] = [
  "preload_out",
  "load_out",
  "post_load_out",
  "rts",
  "closing",
];

/**
 * Tailwind color classes for owner chips on the duties checklist. The
 * map covers the four roles/people we expect day-one; anything else
 * falls back to the neutral muted chip. Adding new colors is a
 * one-liner here — no schema change needed.
 *
 * Picked palettes that survive both light and dark mode without
 * looking washed out, and that read as "different roles" rather than
 * "different severity levels" (so no red/amber).
 */
export const DUTIES_OWNER_CHIP_CLASSES: Record<string, string> = {
  Dispatcher:
    "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  Assistant:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  Michael:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  Barzin:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
};

export const DUTIES_OWNER_CHIP_DEFAULT =
  "bg-muted text-muted-foreground";

export function chipClassForOwner(owner: string): string {
  return DUTIES_OWNER_CHIP_CLASSES[owner] ?? DUTIES_OWNER_CHIP_DEFAULT;
}

/**
 * Compute the period key for a given date + cadence.
 * Daily: YYYY-MM-DD.
 * Weekly: YYYY-Www (ISO week). Weeks start Monday — matches the
 *   dispatcher's mental model since Amazon weeks are Sun-Sat and
 *   our internal weekly tasks (e.g. "by Thursday 12pm") align
 *   with calendar weeks, not Amazon weeks.
 * Monthly: YYYY-MM.
 */
export function periodKeyFor(date: Date, cadence: DutiesCadence): string {
  if (cadence === "daily") {
    return date.toISOString().slice(0, 10);
  }
  if (cadence === "monthly") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // ISO week — pulled from a well-known algorithm to avoid date-fns
  // import here (this file ships to the browser).
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

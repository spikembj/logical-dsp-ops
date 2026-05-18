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

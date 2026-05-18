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

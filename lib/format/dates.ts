import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

/**
 * Consistent date formatting helpers. Display dates use the user's locale;
 * the underlying timezone for week boundaries is set in .env.local
 * (NEXT_PUBLIC_DEFAULT_TZ, currently America/Denver).
 */

/** "Apr 28, 2026" — short month, no day-of-week. Used for session dates. */
export function formatSessionDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

/** "Apr 28, 2026 · 3:14 PM" — for timestamps where time matters. */
export function formatSessionDateTime(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy · h:mm a");
}

/** "3 days ago" — used when something is fresh enough to feel relative. */
export function relativeFromNow(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Compute the week_ending date for an Amazon DSP scorecard.
 *
 * Amazon DSPs treat weeks as Sunday-through-Saturday. Week 1 of any year
 * begins on the first Sunday >= January 1 of that year (or Jan 1 itself
 * if Jan 1 is a Sunday). Week N ends on (Week 1 start + (N-1)*7 + 6) days.
 *
 * Returns ISO date string YYYY-MM-DD.
 */
export function amazonWeekEnding(week: number, year: number): string {
  if (week < 1 || week > 53) throw new Error(`Invalid week: ${week}`);
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const offsetToSunday = (7 - jan1.getUTCDay()) % 7;
  const week1Start = new Date(Date.UTC(year, 0, 1 + offsetToSunday));
  const weekNEnd = new Date(
    week1Start.getTime() + ((week - 1) * 7 + 6) * 86_400_000,
  );
  return weekNEnd.toISOString().slice(0, 10);
}

/**
 * Inverse of amazonWeekEnding — given a week_ending Saturday in YYYY-MM-DD,
 * return the Amazon DSP week number and the year that week belongs to.
 *
 * The "year" is the year that owns the week's Sunday start, which can differ
 * from the year of week_ending itself for Week 53 spanning a year boundary.
 */
export function amazonWeekFromEndingDate(weekEndingIso: string): {
  week: number;
  year: number;
} {
  const ending = new Date(`${weekEndingIso}T00:00:00Z`);
  const sunday = new Date(ending.getTime() - 6 * 86_400_000);
  const year = sunday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const offsetToSunday = (7 - jan1.getUTCDay()) % 7;
  const week1Start = new Date(Date.UTC(year, 0, 1 + offsetToSunday));
  const week =
    Math.floor((sunday.getTime() - week1Start.getTime()) / (7 * 86_400_000)) +
    1;
  return { week, year };
}

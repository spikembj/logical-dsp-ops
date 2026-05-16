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
 * Amazon DSPs treat weeks as Sunday-through-Saturday. **Week 1 of any year
 * is the Sun-Sat week containing January 1.** That can extend into the
 * prior calendar year — e.g. Week 1 of 2026 starts Sunday Dec 28, 2025
 * because Jan 1, 2026 is a Thursday.
 *
 * (Earlier versions of this helper used "first Sunday ≥ Jan 1" which is
 * off-by-one from Amazon's actual labels.)
 *
 * Returns ISO date string YYYY-MM-DD.
 */
export function amazonWeekEnding(week: number, year: number): string {
  if (week < 1 || week > 53) throw new Error(`Invalid week: ${week}`);
  const jan1 = new Date(Date.UTC(year, 0, 1));
  // Week 1 starts on the Sunday at-or-before Jan 1.
  const week1Start = new Date(
    Date.UTC(year, 0, 1 - jan1.getUTCDay()),
  );
  const weekNEnd = new Date(
    week1Start.getTime() + ((week - 1) * 7 + 6) * 86_400_000,
  );
  return weekNEnd.toISOString().slice(0, 10);
}

/**
 * Inverse of amazonWeekEnding — given a week_ending Saturday in YYYY-MM-DD,
 * return the Amazon DSP week number and the year that week belongs to.
 *
 * The "year" is the year of the Saturday (week_ending) — that's how
 * Amazon labels it, even when Week 1's Sunday falls in the prior year.
 */
export function amazonWeekFromEndingDate(weekEndingIso: string): {
  week: number;
  year: number;
} {
  const ending = new Date(`${weekEndingIso}T00:00:00Z`);
  const year = ending.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  // Week 1 ends on the Saturday at-or-after Jan 1's Sun-Sat-week start.
  const week1End = new Date(
    Date.UTC(year, 0, 1 - jan1.getUTCDay() + 6),
  );
  const week =
    Math.round(
      (ending.getTime() - week1End.getTime()) / (7 * 86_400_000),
    ) + 1;
  return { week, year };
}

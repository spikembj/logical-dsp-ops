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

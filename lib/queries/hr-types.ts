/**
 * Client-safe types + pure helpers for the HR module.
 * The server-only query helpers live in `./hr.ts` and re-export
 * everything here so existing imports keep working.
 */

import type { CoachingSessionType } from "@/lib/types/database";
import type { CoachingCategory } from "@/lib/util/coaching-prefill";

/**
 * Session types that need HR sign-off. Trainings + discussions are
 * informal and do not need HR to do anything afterwards.
 *
 * Mirrors the partial-index filter in
 * `supabase/migrations/20260518223018_hr_coaching_review.sql` — keep
 * the two lists in sync if you ever change one.
 */
export const HR_REVIEWABLE_SESSION_TYPES: CoachingSessionType[] = [
  "verbal_warning",
  "write_up",
  "final_warning",
  "termination",
];

export function isHrReviewable(type: CoachingSessionType): boolean {
  return HR_REVIEWABLE_SESSION_TYPES.includes(type);
}

/**
 * One row in the HR coaching review queue. Joined with driver name +
 * reviewer/coach display info so the table renders without any
 * follow-up reads.
 */
export interface HrCoachingReviewRow {
  id: string;
  driver_id: string;
  driver_name: string;
  /** ISO date (YYYY-MM-DD). */
  session_date: string;
  session_type: CoachingSessionType;
  category: CoachingCategory;
  topic: string;
  notes: string | null;
  /** Who logged the session originally. */
  coached_by_name: string | null;
  hr_reviewed_at: string | null;
  hr_reviewed_by_id: string | null;
  hr_reviewed_by_name: string | null;
  hr_review_notes: string | null;
  /** Convenience: the session is voided. Voided rows never block HR — we
   *  still show them in the queue (greyed) so HR can see why something
   *  disappeared without confusion. */
  voided_at: string | null;
}

/** View mode for the HR coaching review queue. */
export type HrQueueMode = "unreviewed" | "reviewed" | "all";

export interface OffenderRow {
  driver_id: string;
  driver_name: string;
  session_count: number;
}

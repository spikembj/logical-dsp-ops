import type { CoachingSessionType } from "@/lib/types/database";

/**
 * Category of trigger this coaching session addresses. Tracked on the
 * coaching_sessions row so triggers can be cleared per-category — a
 * safety coaching clears only the safety trigger, not the quality one.
 *
 * "other" is the catch-all for write-ups, follow-ups, and anything not
 * tied to a specific Safety / Quality / Escalation trigger. Other-
 * category sessions don't clear any trigger from the needs lists.
 */
export type CoachingCategory = "safety" | "quality" | "escalation" | "other";

/**
 * Pre-fill bundle for the Log Session dialog when opened from a specific
 * trigger context (e.g. the Performance dashboard's needs-coaching hero
 * list, or a category in the per-driver triggers panel).
 *
 * The standalone "Log new session" button on the Coaching tab does NOT
 * pass a prefill — it opens blank (category = 'other') so the user can
 * record write-ups, out-of-band conversations, etc. without the form
 * pre-shaping the narrative.
 */
export interface CoachingPrefill {
  session_type: CoachingSessionType;
  topic: string;
  notes: string;
  category: CoachingCategory;
}

/** Format the trailing window phrase consistently across all flavors. */
function windowPhrase(days: number): string {
  return `in the last ${days} ${days === 1 ? "day" : "days"}`;
}

/** Safety-flavored prefill — driven by impacting Netradyne events. */
export function safetyPrefill(args: {
  total_events: number;
  event_types: string[];
  windowDays?: number;
}): CoachingPrefill {
  const days = args.windowDays ?? 7;
  const noun = args.total_events === 1 ? "event" : "events";
  const typesPart =
    args.event_types.length > 0
      ? ` Event types: ${args.event_types.join(", ")}.`
      : "";
  return {
    session_type: "discussion",
    topic: "Safety training",
    notes: `${args.total_events} impacting safety ${noun} ${windowPhrase(days)}.${typesPart}`,
    category: "safety",
  };
}

/** Quality-flavored prefill — driven by latest-scorecard threshold breaches. */
export function qualityPrefill(args: {
  /** Pre-formatted issue strings, e.g. ["DCR 97.2 < 99.0%", "CDF DPMO 1240 > 800"] */
  issues: string[];
}): CoachingPrefill {
  const bullets = args.issues.map((i) => `• ${i}`).join("\n");
  return {
    session_type: "discussion",
    topic: "Quality training",
    notes: `Quality triggers from latest scorecard:\n${bullets}`,
    category: "quality",
  };
}

/** Escalation-flavored prefill — driven by open Amazon infractions. */
export function escalationPrefill(args: {
  items: { behavior: string; incident_date: string }[];
}): CoachingPrefill {
  const bullets = args.items
    .map((b) => `• ${b.behavior} (${b.incident_date})`)
    .join("\n");
  return {
    session_type: "discussion",
    topic: "Escalation review",
    notes: `Open Amazon escalations to discuss:\n${bullets}`,
    category: "escalation",
  };
}

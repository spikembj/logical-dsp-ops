import type { CoachingSessionType } from "@/lib/types/database";

/**
 * Category of a coaching session. Two flavors of value:
 *
 * **Trigger-clearing categories** — `safety / quality / escalation /
 * other`. Set automatically when the dialog is opened from a trigger
 * button on the dashboard or the per-driver triggers panel. The first
 * three clear the matching trigger from the needs-coaching lists; "other"
 * is the catch-all that does not clear anything.
 *
 * **Policy-point categories** — the 11 remaining values mirror the
 * dispatcher's existing write-up vocabulary (No Call No Show, Van
 * Damage, etc.). Manually picked from the dropdown when logging a
 * write-up; they do NOT clear any trigger.
 */
export type CoachingCategory =
  | "safety"
  | "quality"
  | "escalation"
  | "other"
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
  | "unable_to_finish";

/** Human-readable labels for the dropdown. */
export const COACHING_CATEGORY_LABELS: Record<CoachingCategory, string> = {
  safety: "Safety",
  quality: "Quality",
  escalation: "Escalation",
  other: "Other",
  same_day_call_off: "Same day call off",
  no_call_no_show: "No call no show",
  abandon_route: "Abandon route",
  safety_concern: "Safety concern",
  quality_issue: "Quality issue",
  behavior_issue: "Behavior issue",
  van_damage: "Van damage",
  property_damage: "Property damage",
  slept_in: "Slept in",
  quit: "Quit",
  unable_to_finish: "Unable to finish in timely manner",
};

/**
 * Categories grouped for the dropdown — the first group clears a
 * trigger when selected, the second is purely descriptive.
 */
export const COACHING_CATEGORY_GROUPS: {
  label: string;
  values: CoachingCategory[];
}[] = [
  {
    label: "Trigger-clearing",
    values: ["safety", "quality", "escalation", "other"],
  },
  {
    label: "Policy point",
    values: [
      "same_day_call_off",
      "no_call_no_show",
      "abandon_route",
      "safety_concern",
      "quality_issue",
      "behavior_issue",
      "van_damage",
      "property_damage",
      "slept_in",
      "quit",
      "unable_to_finish",
    ],
  },
];

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
    session_type: "training",
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
    session_type: "training",
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
    session_type: "training",
    topic: "Escalation review",
    notes: `Open Amazon escalations to discuss:\n${bullets}`,
    category: "escalation",
  };
}

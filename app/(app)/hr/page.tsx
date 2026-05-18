import { Inbox, CheckCircle2, AlertTriangle } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import {
  getHrCoachingCounts,
  getWorstOffenders90d,
  listHrCoachingQueue,
  type HrQueueMode,
} from "@/lib/queries/hr";
import {
  COACHING_CATEGORY_LABELS,
  type CoachingCategory,
} from "@/lib/util/coaching-prefill";
import { CoachingReviewQueue } from "@/components/app/hr/coaching-review-queue";
import { WorstOffendersPanel } from "@/components/app/hr/worst-offenders-panel";
import { cn } from "@/lib/utils";

/**
 * HR landing page. Pass A of the HR module:
 *   1. Three header stat tiles (awaiting / reviewed this week / top offender)
 *   2. Coaching review queue — sign-off surface for write-ups + warnings
 *   3. Worst-10 panel — top drivers by coaching count in the last 90d,
 *      filterable by category
 *
 * Trainings + discussions are excluded everywhere on this page — HR
 * does not need to sign off on informal coaching.
 *
 * Sub-routes (candidates kanban, HR duties, dispatcher interview view,
 * QR'd interviewee form, onboarding tracking) land in later passes.
 */
export default async function HrPage({
  searchParams,
}: {
  // Next 16 made route segment params a Promise. Same for searchParams.
  searchParams: Promise<{ mode?: string; cat?: string }>;
}) {
  await requireManagement();
  const sp = await searchParams;

  const mode: HrQueueMode =
    sp.mode === "reviewed" || sp.mode === "all" ? sp.mode : "unreviewed";
  const cat: CoachingCategory | "all" = isCategory(sp.cat) ? sp.cat : "all";

  const [counts, queueRows, offenders] = await Promise.all([
    getHrCoachingCounts(),
    listHrCoachingQueue(mode),
    getWorstOffenders90d(cat),
  ]);

  const topOffender = offenders[0];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sign off on coaching paperwork, watch for repeat offenders, and
            (soon) track candidates + onboarding.
          </p>
        </div>
        {/* Pass A ships the dashboard only — header buttons land in later
            passes when the candidates kanban and HR duties checklist exist. */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label="Awaiting HR review"
          count={counts.awaiting}
          hint={`${counts.awaiting_recent_30d} in last 30 days`}
          accent={counts.awaiting > 0 ? "warn" : "good"}
          icon={Inbox}
        />
        <StatTile
          label="Reviewed this week"
          count={counts.reviewed_this_week}
          hint="HR sign-offs in last 7 days"
          accent="default"
          icon={CheckCircle2}
        />
        <StatTile
          label="Top offender (90d)"
          count={topOffender?.session_count ?? 0}
          hint={
            topOffender
              ? topOffender.driver_name +
                (cat !== "all"
                  ? ` · ${COACHING_CATEGORY_LABELS[cat]}`
                  : "")
              : cat !== "all"
                ? `No drivers in ${COACHING_CATEGORY_LABELS[cat]} this window`
                : "No reviewable coaching this window"
          }
          accent={topOffender ? "warn" : "good"}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CoachingReviewQueue rows={queueRows} mode={mode} />
        </div>
        <WorstOffendersPanel rows={offenders} selected={cat} />
      </div>
    </div>
  );
}

function StatTile({
  label,
  count,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  count: number;
  hint?: string;
  accent: "good" | "warn" | "default";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const accentColor =
    accent === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : accent === "good"
        ? "text-emerald-700 dark:text-emerald-400"
        : "";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accentColor)}>
        {count}
      </div>
      {hint && (
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {hint}
        </div>
      )}
    </div>
  );
}

const CATEGORY_VALUES = new Set<CoachingCategory>([
  "safety",
  "quality",
  "escalation",
  "other",
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
]);

function isCategory(v: unknown): v is CoachingCategory {
  return typeof v === "string" && CATEGORY_VALUES.has(v as CoachingCategory);
}

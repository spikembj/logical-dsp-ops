import {
  ShieldAlert,
  FileWarning,
  AlertOctagon,
  CheckCircle2,
} from "lucide-react";
import type { DriverCoachingTriggers } from "@/lib/queries/coaching-triggers";
import { formatSessionDate } from "@/lib/format/dates";

/**
 * Surfaces the open coaching triggers for a driver: impacting safety
 * events, latest-scorecard quality breaches, and any open Amazon
 * escalations. Shown above the coaching history on the driver's Coaching
 * tab.
 */
export function TriggersPanel({
  triggers,
}: {
  triggers: DriverCoachingTriggers;
}) {
  const total =
    triggers.safety.length +
    triggers.quality.length +
    triggers.escalations.length;

  if (total === 0 && !triggers.hasSessionInWindow) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">Nothing flagged this week.</span>
          <span className="text-muted-foreground">
            No impacting events, quality breaches, or open escalations.
          </span>
        </div>
      </div>
    );
  }

  if (total === 0 && triggers.hasSessionInWindow) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">Coached this week.</span>
          <span className="text-muted-foreground">
            No further open triggers.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-sm font-medium">Needs coaching</h3>
        <span className="text-xs text-muted-foreground">
          {triggers.hasSessionInWindow
            ? "Already coached this week — context only"
            : `Last ${triggers.windowDays} days · open escalations any time`}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
        {/* Safety */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Safety
            <span className="ml-auto text-foreground font-medium">
              {triggers.safety.length}
            </span>
          </div>
          {triggers.safety.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No impacting safety events.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {triggers.safety.map((s) => (
                <li
                  key={s.event_type}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="truncate">{s.event_type}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {s.total_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Quality */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <FileWarning className="h-3.5 w-3.5" />
            Quality
            <span className="ml-auto text-foreground font-medium">
              {triggers.quality.length}
            </span>
          </div>
          {triggers.quality.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No quality breaches on the latest scorecard.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {triggers.quality.map((q) => (
                <li
                  key={q.metric}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span>
                    {q.metric}{" "}
                    <span className="tabular-nums">{q.value}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    threshold {q.threshold}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Escalations */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <AlertOctagon className="h-3.5 w-3.5" />
            Escalations
            <span className="ml-auto text-foreground font-medium">
              {triggers.escalations.length}
            </span>
          </div>
          {triggers.escalations.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No open infractions from Amazon.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {triggers.escalations.map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="truncate" title={e.behavior}>
                    {e.behavior}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatSessionDate(e.incident_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

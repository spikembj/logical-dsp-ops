import Link from "next/link";
import type {
  DashboardSafetyLeaderboards,
  SafetyLeaderboardRow,
} from "@/lib/queries/dashboard";

/**
 * Three-card row for the Safety dashboard: Top 5 (fewest impacting events
 * last 7 days), Most Improved (top 3 by WoW drop), Bottom 5 (most events).
 * Mirrors the structure of the Quality leaderboards but ranks by safety
 * signals instead of overall_score.
 */
export function SafetyLeaderboards({
  fewest,
  most,
  mostImproved,
  eligibleCount,
  windowDays,
}: DashboardSafetyLeaderboards) {
  const hint =
    eligibleCount === 0
      ? "No drivers in latest scorecard yet"
      : `Last ${windowDays} days · ${eligibleCount} eligible drivers`;

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <SafetyCard
        title="Cleanest 5"
        hint={hint}
        rows={fewest}
        emptyMessage="No eligible drivers."
        metricLabel="impacting"
      />
      <ImprovedCard
        title="Most improved"
        hint={`This week vs. prior 7 days`}
        rows={mostImproved}
        emptyMessage="No safety improvements week-over-week yet."
      />
      <SafetyCard
        title="Most events"
        hint={hint}
        rows={most}
        emptyMessage="No impacting events this week."
        metricLabel="impacting"
      />
    </section>
  );
}

function SafetyCard({
  title,
  hint,
  rows,
  emptyMessage,
  metricLabel,
}: {
  title: string;
  hint: string;
  rows: SafetyLeaderboardRow[];
  emptyMessage: string;
  metricLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          {emptyMessage}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={r.driver_id}
              className="flex items-center gap-2 text-sm py-0.5"
            >
              <span className="w-5 text-right tabular-nums text-xs text-muted-foreground">
                {i + 1}.
              </span>
              <Link
                href={`/drivers/${r.driver_id}`}
                className="flex-1 truncate hover:underline"
                title={r.full_name}
              >
                {r.full_name}
              </Link>
              <span className="text-xs text-muted-foreground tabular-nums">
                {r.impacting_count} {metricLabel}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ImprovedCard({
  title,
  hint,
  rows,
  emptyMessage,
}: {
  title: string;
  hint: string;
  rows: SafetyLeaderboardRow[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          {emptyMessage}
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const drop = (r.prior_impacting_count ?? 0) - r.impacting_count;
            return (
              <li
                key={r.driver_id}
                className="flex items-center gap-2 text-sm py-0.5"
              >
                <span className="w-5 text-right tabular-nums text-xs text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/drivers/${r.driver_id}`}
                    className="hover:underline block truncate"
                    title={r.full_name}
                  >
                    {r.full_name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {r.prior_impacting_count ?? 0} → {r.impacting_count} events
                  </p>
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums font-medium">
                  −{drop}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

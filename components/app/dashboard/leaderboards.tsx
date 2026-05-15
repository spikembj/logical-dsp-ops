import Link from "next/link";
import { TierBadge } from "@/lib/format/badges";
import { amazonWeekFromEndingDate } from "@/lib/format/dates";
import type {
  DashboardLeaderboards,
  LeaderboardRow,
  MostImprovedRow,
} from "@/lib/queries/dashboard";

/**
 * Three side-by-side leaderboard cards: Top 5 / Most improved / Bottom 5.
 *
 * Lives in the home Performance dashboard between the company trend
 * chart and the needs-coaching hero list. All three cards share the
 * "rounded-xl border bg-card" tile chrome used by the stat tiles.
 */
export function Leaderboards({
  latestWeekEnding,
  priorWeekEnding,
  top,
  bottom,
  mostImproved,
  minDeliveries,
}: DashboardLeaderboards) {
  const latestLabel = latestWeekEnding
    ? `Week ${amazonWeekFromEndingDate(latestWeekEnding).week}`
    : null;
  const priorLabel = priorWeekEnding
    ? `Week ${amazonWeekFromEndingDate(priorWeekEnding).week}`
    : null;

  const eligibilityHint = latestLabel
    ? `${latestLabel} · ≥${minDeliveries} deliveries`
    : "No scorecard data yet";
  const improvedHint =
    latestLabel && priorLabel
      ? `${latestLabel} vs. ${priorLabel}`
      : "Needs two weeks of scorecards";

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <LeaderboardCard title="Top 5" hint={eligibilityHint} rows={top} />
      <MostImprovedCard
        title="Most improved"
        hint={improvedHint}
        rows={mostImproved}
      />
      <LeaderboardCard title="Bottom 5" hint={eligibilityHint} rows={bottom} />
    </section>
  );
}

function LeaderboardCard({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: LeaderboardRow[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          No drivers meet the threshold yet.
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
              <TierBadge tier={r.tier} />
              <span className="w-11 text-right tabular-nums font-medium">
                {r.overall_score.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MostImprovedCard({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: MostImprovedRow[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-6 text-center">
          No drivers improved week-over-week yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
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
                  {r.prior_score.toFixed(1)} → {r.current_score.toFixed(1)}
                </p>
              </div>
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums font-medium">
                +{r.delta.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { requireUser } from "@/lib/auth/require-role";
import { getDashboardData } from "@/lib/queries/dashboard";
import {
  amazonWeekFromEndingDate,
  formatSessionDate,
} from "@/lib/format/dates";
import { StatTile } from "@/components/app/dashboard/stat-tile";
import { NeedsCoachingList } from "@/components/app/dashboard/needs-coaching-list";
import { RecentActivity } from "@/components/app/dashboard/recent-activity";

export default async function DashboardPage() {
  const me = await requireUser();
  const data = await getDashboardData();
  const { week, year } = amazonWeekFromEndingDate(data.window.asOf);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hi {me.full_name?.split(" ")[0] ?? me.email}.{" "}
            <span className="text-foreground font-medium">
              Week {week}, {year}
            </span>{" "}
            · ending{" "}
            <span className="text-foreground font-medium">
              {formatSessionDate(data.window.asOf)}
            </span>
            .
          </p>
        </div>
      </header>

      {/* Top stat row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Active drivers"
          value={data.stats.activeDriverCount}
          hint="last 60 days of activity"
        />
        <StatTile
          label="Safety events"
          value={data.stats.impactingEventTotal}
          secondary={{
            label: "non-impacting",
            value: data.stats.nonImpactingEventTotal,
          }}
          hint="impacting · 7-day window"
          accent={data.stats.impactingEventTotal > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Coaching sessions"
          value={data.stats.sessionCount}
          hint="logged this week"
        />
        <StatTile
          label="Needs coaching"
          value={data.stats.needsSafetyCount}
          secondary={{
            label: "quality",
            value: data.stats.needsQualityCount,
          }}
          hint="safety · quality"
          accent={
            data.stats.needsSafetyCount + data.stats.needsQualityCount > 0
              ? "warn"
              : "good"
          }
        />
      </section>

      {/* Two-column body: hero list + recent activity */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NeedsCoachingList
            safety={data.needsCoachingSafety}
            quality={data.needsCoachingQuality}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-medium">Recent coaching</h2>
            <p className="text-xs text-muted-foreground">last 10</p>
          </div>
          <RecentActivity sessions={data.recentSessions} />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Quality coaching uses thresholds: DCR&nbsp;&lt;&nbsp;99% ·
        POD&nbsp;&lt;&nbsp;99% · CDF&nbsp;DPMO&nbsp;&gt;&nbsp;800 ·
        any&nbsp;CED · DSB&nbsp;&lt;&nbsp;233 · PSB&nbsp;&gt;&nbsp;10%.
        Per-driver tier (Platinum/Gold/Silver/Bronze) ships once the DSP
        Overview Dashboard CSV import lands.
      </p>
    </div>
  );
}

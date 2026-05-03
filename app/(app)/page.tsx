import { requireUser } from "@/lib/auth/require-role";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatSessionDate } from "@/lib/format/dates";
import { StatTile } from "@/components/app/dashboard/stat-tile";
import { NeedsCoachingList } from "@/components/app/dashboard/needs-coaching-list";
import { RecentActivity } from "@/components/app/dashboard/recent-activity";

export default async function DashboardPage() {
  const me = await requireUser();
  const data = await getDashboardData();

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hi {me.full_name?.split(" ")[0] ?? me.email}. Week ending{" "}
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
        />
        <StatTile
          label="Impacting events"
          value={data.stats.impactingEventTotal}
          hint={`${data.stats.impactingEventRowCount} rows · 7 days`}
          accent={data.stats.impactingEventTotal > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Coaching sessions"
          value={data.stats.sessionCount}
          hint="logged this week"
        />
        <StatTile
          label="Needs coaching"
          value={data.stats.needsCoachingCount}
          hint="impacting events, no session"
          accent={data.stats.needsCoachingCount > 0 ? "warn" : "good"}
        />
      </section>

      {/* Two-column body: hero list + recent activity */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-medium">Needs coaching this week</h2>
            <p className="text-xs text-muted-foreground">
              Impacting events, no session yet
            </p>
          </div>
          <NeedsCoachingList drivers={data.needsCoaching} />
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
        Tier-based tiles (count by tier, trending down) ship in step&nbsp;6.5
        once the per-driver tier lands via the DSP Overview Dashboard CSV.
      </p>
    </div>
  );
}

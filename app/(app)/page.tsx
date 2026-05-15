import { format } from "date-fns";
import { requireUser } from "@/lib/auth/require-role";
import { getDashboardData, getCompanyTrend } from "@/lib/queries/dashboard";
import { amazonWeekFromEndingDate } from "@/lib/format/dates";
import { StatTile } from "@/components/app/dashboard/stat-tile";
import { SplitStatTile } from "@/components/app/dashboard/split-stat-tile";
import { NeedsCoachingList } from "@/components/app/dashboard/needs-coaching-list";
import { RecentActivity } from "@/components/app/dashboard/recent-activity";
import { PerformanceTrendChart } from "@/components/app/perf/trend-chart";

/** First name from full_name; falls back to "there" if it's an email. */
function getFirstName(profile: { full_name: string | null; email: string }) {
  const fn = profile.full_name?.trim();
  if (!fn) return "there";
  if (fn.includes("@")) return "there";
  return fn.split(/\s+/)[0];
}

/** "May 3rd, 2026" — full month + ordinal day. */
function formatHeaderDate(d: Date): string {
  return format(d, "MMMM do, yyyy");
}

/** Amazon week (Sun-Sat) that contains the given date. */
function currentAmazonWeek(d: Date): { week: number; year: number } {
  // Find the Saturday of this week. If d is Saturday, that's d itself;
  // otherwise the next Saturday.
  const dayOfWeek = d.getUTCDay(); // 0 = Sun, 6 = Sat
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(d.getTime() + daysUntilSaturday * 86_400_000);
  const iso = saturday.toISOString().slice(0, 10);
  return amazonWeekFromEndingDate(iso);
}

export default async function DashboardPage() {
  const me = await requireUser();
  const [data, companyTrend] = await Promise.all([
    getDashboardData(),
    getCompanyTrend(),
  ]);
  const today = new Date();
  const { week, year } = currentAmazonWeek(today);
  const companyTrendDescription =
    companyTrend.length === 0
      ? "No weeks on record."
      : `Avg across ${companyTrend[companyTrend.length - 1]!.driver_count} drivers in latest week · last ${companyTrend.length} weeks.`;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hi {getFirstName(me)} —{" "}
            <span className="text-foreground font-medium">
              Week {week}, {formatHeaderDate(today)}
            </span>
            {data.window.asOf !== today.toISOString().slice(0, 10) && (
              <>
                {" "}
                <span className="text-xs">
                  (data through{" "}
                  {format(new Date(`${data.window.asOf}T12:00:00Z`), "MMM d")})
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Top stat row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Active drivers"
          value={data.stats.activeDriverCount}
          hint="last 30 days of activity"
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
        <SplitStatTile
          label="Needs coaching"
          hint="open triggers, no session yet"
          left={{
            label: "Safety",
            value: data.stats.needsSafetyCount,
            accent: data.stats.needsSafetyCount > 0 ? "warn" : "good",
          }}
          right={{
            label: "Quality",
            value: data.stats.needsQualityCount,
            accent: data.stats.needsQualityCount > 0 ? "warn" : "good",
          }}
        />
      </section>

      {/* Company-wide performance trend (12 weeks, simple avg) */}
      <section>
        <PerformanceTrendChart
          scorecards={companyTrend}
          title="Company trend"
          description={companyTrendDescription}
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
        any&nbsp;CED · DSB&nbsp;DPMO&nbsp;&gt;&nbsp;233 · any&nbsp;DSB
        count · PSB&nbsp;&gt;&nbsp;10% defect rate.
      </p>
    </div>
  );
}

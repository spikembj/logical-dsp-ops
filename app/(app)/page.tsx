import { format } from "date-fns";
import { requireUser } from "@/lib/auth/require-role";
import {
  getDashboardData,
  getCompanyTrend,
  getDashboardLeaderboards,
  getDashboardSafetyLeaderboards,
  getSafetyEventMix,
  getSafetyEventSeries,
  getSafetyThresholdDrivers,
  getQualityThresholdDrivers,
  getCdfNegativeMix,
  getDsbMix,
  getNegativeCdfDriverCount,
  SAFETY_IMPACTING_THRESHOLD,
  SAFETY_NON_IMPACTING_THRESHOLD,
} from "@/lib/queries/dashboard";
import { amazonWeekFromEndingDate } from "@/lib/format/dates";
import { StatTile } from "@/components/app/dashboard/stat-tile";
import { ThresholdTile } from "@/components/app/dashboard/threshold-tile";
import { NeedsCoachingList } from "@/components/app/dashboard/needs-coaching-list";
import { Leaderboards } from "@/components/app/dashboard/leaderboards";
import { SafetyLeaderboards } from "@/components/app/dashboard/safety-leaderboards";
import { SafetyEventDonuts } from "@/components/app/dashboard/safety-donuts";
import { QualityDonuts } from "@/components/app/dashboard/quality-donuts";
import { SafetyTrendChart } from "@/components/app/dashboard/safety-trend-chart";
import { QualityTrendChart } from "@/components/app/dashboard/quality-trend-chart";
import { ViewToggle, type DashboardView } from "@/components/app/dashboard/view-toggle";

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
  const dayOfWeek = d.getUTCDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(d.getTime() + daysUntilSaturday * 86_400_000);
  const iso = saturday.toISOString().slice(0, 10);
  return amazonWeekFromEndingDate(iso);
}

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const me = await requireUser();
  const params = await searchParams;
  const view: DashboardView =
    params.view === "quality" ? "quality" : "safety";

  // Load everything in parallel. Some queries only matter for one view but
  // the cost difference is small and parallel loads beat lazy nav delays.
  const [
    data,
    companyTrend,
    qualityLeaderboards,
    safetyLeaderboards,
    safetyMix,
    safetyImpactingSeries,
    safetyNonImpactingSeries,
    safetyThresholdDrivers,
    qualityThresholdDrivers,
    cdfMix,
    dsbMix,
    negativeCdfDriverCount,
  ] = await Promise.all([
    getDashboardData(),
    getCompanyTrend(),
    getDashboardLeaderboards(),
    getDashboardSafetyLeaderboards(),
    getSafetyEventMix(),
    getSafetyEventSeries("impacting"),
    getSafetyEventSeries("non_impacting"),
    getSafetyThresholdDrivers(),
    getQualityThresholdDrivers(),
    getCdfNegativeMix(),
    getDsbMix(),
    getNegativeCdfDriverCount(),
  ]);
  const today = new Date();
  const { week } = currentAmazonWeek(today);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <ViewToggle current={view} />
        </div>
        <p className="text-sm text-muted-foreground">
          Hi {getFirstName(me)} —{" "}
          <span className="text-foreground font-medium">
            Week {week}, {formatHeaderDate(today)}
          </span>
          <span className="text-xs">
            {" · "}
            {data.stats.activeDriverCount}{" "}
            {data.stats.activeDriverCount === 1 ? "active driver" : "active drivers"}
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
      </header>

      {view === "safety" ? (
        <SafetyView
          impactingTotal={data.stats.impactingEventTotal}
          nonImpactingTotal={data.stats.nonImpactingEventTotal}
          sessionCount={data.stats.sessionCount}
          needsCoachingCount={data.stats.needsSafetyCount}
          safetyThresholdDrivers={safetyThresholdDrivers}
          impactingSeries={safetyImpactingSeries}
          nonImpactingSeries={safetyNonImpactingSeries}
          leaderboards={safetyLeaderboards}
          needsSafety={data.needsCoachingSafety}
          needsQuality={data.needsCoachingQuality}
          mix={safetyMix}
        />
      ) : (
        <QualityView
          companyTrend={companyTrend}
          sessionCount={data.stats.sessionCount}
          needsCoachingCount={data.stats.needsQualityCount}
          qualityThresholdDrivers={qualityThresholdDrivers}
          leaderboards={qualityLeaderboards}
          needsSafety={data.needsCoachingSafety}
          needsQuality={data.needsCoachingQuality}
          cdfMix={cdfMix}
          dsbMix={dsbMix}
          negativeCdfDriverCount={negativeCdfDriverCount}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Quality coaching uses thresholds: DCR&nbsp;&lt;&nbsp;99% ·
        POD&nbsp;&lt;&nbsp;99% · CDF&nbsp;DPMO&nbsp;&gt;&nbsp;800 ·
        any&nbsp;CED · DSB&nbsp;DPMO&nbsp;&gt;&nbsp;233 · any&nbsp;DSB
        count · PSB&nbsp;&gt;&nbsp;10% defect rate. Safety threshold:{" "}
        {SAFETY_IMPACTING_THRESHOLD}+ impacting or {SAFETY_NON_IMPACTING_THRESHOLD}+
        non-impacting events in last 7 days.
      </p>
    </div>
  );
}

// =============================================================================
// SAFETY VIEW
// =============================================================================

function SafetyView({
  impactingTotal,
  nonImpactingTotal,
  sessionCount,
  needsCoachingCount,
  safetyThresholdDrivers,
  impactingSeries,
  nonImpactingSeries,
  leaderboards,
  needsSafety,
  needsQuality,
  mix,
}: {
  impactingTotal: number;
  nonImpactingTotal: number;
  sessionCount: number;
  needsCoachingCount: number;
  safetyThresholdDrivers: Awaited<
    ReturnType<typeof getSafetyThresholdDrivers>
  >;
  impactingSeries: Awaited<ReturnType<typeof getSafetyEventSeries>>;
  nonImpactingSeries: Awaited<ReturnType<typeof getSafetyEventSeries>>;
  leaderboards: Awaited<ReturnType<typeof getDashboardSafetyLeaderboards>>;
  needsSafety: Awaited<ReturnType<typeof getDashboardData>>["needsCoachingSafety"];
  needsQuality: Awaited<ReturnType<typeof getDashboardData>>["needsCoachingQuality"];
  mix: Awaited<ReturnType<typeof getSafetyEventMix>>;
}) {
  return (
    <>
      {/* Safety stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Impacting events"
          value={impactingTotal}
          hint="last 7 days"
          accent={impactingTotal > 0 ? "warn" : "good"}
        />
        <StatTile
          label="Non-impacting events"
          value={nonImpactingTotal}
          hint="last 7 days"
        />
        <StatTile
          label="Coaching sessions"
          value={sessionCount}
          hint="logged this week"
        />
        <ThresholdTile
          kind="safety"
          label="Above threshold"
          hint={`${SAFETY_IMPACTING_THRESHOLD}+ impacting or ${SAFETY_NON_IMPACTING_THRESHOLD}+ non-impacting`}
          dialogTitle="Drivers above the safety threshold"
          dialogDescription={`1+ impacting or 4+ non-impacting safety events in the last 7 days. Click any name to open their profile.`}
          drivers={safetyThresholdDrivers}
        />
      </section>

      {/* Company safety trend */}
      <SafetyTrendChart
        impacting={impactingSeries}
        nonImpacting={nonImpactingSeries}
      />

      {/* Safety leaderboards */}
      <SafetyLeaderboards {...leaderboards} />

      {/* Needs coaching hero (safety only) */}
      <NeedsCoachingList mode="safety" safety={needsSafety} quality={needsQuality} />

      {/* Safety donuts */}
      <SafetyEventDonuts mix={mix} />
    </>
  );
}

// =============================================================================
// QUALITY VIEW
// =============================================================================

function QualityView({
  companyTrend,
  sessionCount,
  needsCoachingCount,
  qualityThresholdDrivers,
  leaderboards,
  needsSafety,
  needsQuality,
  cdfMix,
  dsbMix,
  negativeCdfDriverCount,
}: {
  companyTrend: Awaited<ReturnType<typeof getCompanyTrend>>;
  sessionCount: number;
  needsCoachingCount: number;
  qualityThresholdDrivers: Awaited<
    ReturnType<typeof getQualityThresholdDrivers>
  >;
  leaderboards: Awaited<ReturnType<typeof getDashboardLeaderboards>>;
  needsSafety: Awaited<ReturnType<typeof getDashboardData>>["needsCoachingSafety"];
  needsQuality: Awaited<ReturnType<typeof getDashboardData>>["needsCoachingQuality"];
  cdfMix: Awaited<ReturnType<typeof getCdfNegativeMix>>;
  dsbMix: Awaited<ReturnType<typeof getDsbMix>>;
  negativeCdfDriverCount: number;
}) {
  // Avg overall from the most recent week in companyTrend, if any.
  const latest = companyTrend[companyTrend.length - 1];
  const avgOverall = latest?.overall_score;

  return (
    <>
      {/* Quality stat tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Avg overall score"
          value={avgOverall !== null && avgOverall !== undefined ? avgOverall.toFixed(1) : "—"}
          hint={latest ? "latest week, all drivers" : "no scorecards yet"}
        />
        <StatTile
          label="Drivers with negative CDF"
          value={negativeCdfDriverCount}
          hint="rolling last 7 days"
          accent={negativeCdfDriverCount > 0 ? "warn" : "good"}
        />
        <StatTile
          label="Coaching sessions"
          value={sessionCount}
          hint="logged this week"
        />
        <ThresholdTile
          kind="quality"
          label="Below threshold"
          hint="any quality breach on latest scorecard"
          dialogTitle="Drivers breaking quality thresholds"
          dialogDescription="From the latest scorecard. Click any name to open their profile."
          drivers={qualityThresholdDrivers}
        />
      </section>

      {/* Company quality trend (toggleable: percent / DPMO) */}
      <QualityTrendChart points={companyTrend} />

      {/* Quality leaderboards (unchanged: by overall_score) */}
      <Leaderboards {...leaderboards} />

      {/* Needs coaching hero (quality only) */}
      <NeedsCoachingList mode="quality" safety={needsSafety} quality={needsQuality} />

      {/* Quality donuts: Negative CDF + DSB */}
      <QualityDonuts cdf={cdfMix} dsb={dsbMix} />
    </>
  );
}

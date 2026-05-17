import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listScorecardsForDriver } from "@/lib/queries/scorecards";
import {
  getLatestPodDetails,
  podRejectBreakdown,
} from "@/lib/queries/pod-details";
import { listDefectsForDriver } from "@/lib/queries/defects";
import { listEventsForDriver } from "@/lib/queries/safety-events";
import {
  amazonWeekFromEndingDate,
  formatSessionDate,
} from "@/lib/format/dates";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TierBadge } from "@/lib/format/badges";
import type { Tier } from "@/lib/types/database";
import { PerformanceTrendChart } from "@/components/app/perf/trend-chart";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverPerformancePage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const [scorecards, podLatest, defects, safetyEvents] = await Promise.all([
    listScorecardsForDriver(id),
    getLatestPodDetails(id),
    listDefectsForDriver(id),
    listEventsForDriver(id),
  ]);
  const podBreakdown = podLatest ? podRejectBreakdown(podLatest) : [];

  // Aggregate concessions + CDF for the summary cards on this tab.
  const concessions = defects.filter((d) => d.kind === "concession");
  const cdfRows = defects.filter((d) => d.kind === "cdf");
  const concDsbCount = concessions.filter((c) => c.impacts_dsb).length;
  const concTypeCounts = new Map<string, number>();
  for (const c of concessions) {
    for (const t of c.defect_types ?? [])
      concTypeCounts.set(t, (concTypeCounts.get(t) ?? 0) + 1);
  }
  const concTypeBreakdown = [...concTypeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  // CDF: group each TBA under every type it was flagged for. A TBA with
  // multiple feedback types appears under each — accurate, not double-
  // counting. Each group sorted by date desc (most recent first); types
  // sorted by group size desc (worst category at the top).
  type CdfItem = { id: string; tracking_id: string; date: string };
  const cdfByType = new Map<string, CdfItem[]>();
  for (const c of cdfRows) {
    for (const t of c.feedback_types ?? []) {
      if (!cdfByType.has(t)) cdfByType.set(t, []);
      cdfByType.get(t)!.push({
        id: c.id,
        tracking_id: c.tracking_id,
        date: c.date,
      });
    }
  }
  const cdfGroups = [...cdfByType.entries()]
    .map(([type, items]) => ({
      type,
      items: items.sort((a, b) => (a.date < b.date ? 1 : -1)),
    }))
    .sort((a, b) => b.items.length - a.items.length);

  // Sum of `count` across all event rows — Netradyne sometimes lumps
  // multiple of the same event_type into one row with count>1.
  const safetyEventTotal = safetyEvents.reduce(
    (acc, e) => acc + (e.count ?? 0),
    0,
  );
  const safetyImpactingTotal = safetyEvents
    .filter((e) => e.severity === "impacting")
    .reduce((acc, e) => acc + (e.count ?? 0), 0);

  const hasAnyActivity =
    safetyEvents.length > 0 ||
    concessions.length > 0 ||
    cdfRows.length > 0 ||
    !!podLatest;

  if (scorecards.length === 0) {
    // No scorecards on file. Two sub-cases:
    //   1. Truly no data → friendly empty state (original).
    //   2. Has activity in some other source → "Recent activity" panel +
    //      still render the existing POD/concessions/CDF/safety sections.
    if (!hasAnyActivity) {
      return (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No scorecards yet for {driver.full_name}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Scorecards land each Sunday once Amazon publishes the prior
            week. New hires usually show their first one within a week of
            their first route. Other Performance data (concessions, POD,
            safety events) appears here too as it comes in.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <section className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">Recent activity</h3>
            <span className="text-xs text-muted-foreground">
              no scorecard yet
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {driver.full_name} doesn&apos;t have a scorecard on file, but
            we&apos;ve seen activity from other sources. First scorecard
            lands the Sunday after Amazon publishes the prior week.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-1">
            <Stat
              label="Concessions"
              value={concessions.length}
              hint={concDsbCount > 0 ? `${concDsbCount} DSB` : undefined}
            />
            <Stat label="Negative CDF" value={cdfRows.length} />
            <Stat
              label="Safety events"
              value={safetyEventTotal}
              hint={
                safetyImpactingTotal > 0
                  ? `${safetyImpactingTotal} impacting`
                  : undefined
              }
            />
            <Stat
              label="POD rejects"
              value={podLatest?.rejects ?? 0}
              hint={
                podLatest
                  ? `wk ${amazonWeekFromEndingDate(podLatest.week_ending).week}`
                  : undefined
              }
            />
          </div>
        </section>

        {/* Reuse the existing per-section cards. They self-hide when empty. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {podLatest && podLatest.rejects > 0 && (
            <PodCard
              podLatest={podLatest}
              podBreakdown={podBreakdown}
            />
          )}
          {concessions.length > 0 && (
            <ConcessionsCard
              total={concessions.length}
              dsbCount={concDsbCount}
              typeBreakdown={concTypeBreakdown}
            />
          )}
          {cdfRows.length > 0 && (
            <CdfCard groups={cdfGroups} totalRows={cdfRows.length} />
          )}
        </div>
      </div>
    );
  }

  const fmt = (n: number | null | undefined, suffix = "") =>
    n === null || n === undefined ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      `${n}${suffix}`
    );

  // Vertical group divider — pseudo-element with row-line gaps.
  const SEP =
    "relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']";

  return (
    <div className="space-y-4">
      <PerformanceTrendChart scorecards={scorecards} />

      <p className="text-xs text-muted-foreground">
        {scorecards.length} {scorecards.length === 1 ? "week" : "weeks"} on
        record. Scroll horizontally for all metrics.
      </p>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {/* Group-label row */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 bg-card z-10" />
              <TableHead
                colSpan={2}
                className="text-center text-[10px] uppercase tracking-wider text-muted-foreground font-normal"
              >
                Standing
              </TableHead>
              <TableHead />
              <TableHead
                colSpan={6}
                className={`text-center text-[10px] uppercase tracking-wider text-muted-foreground font-normal ${SEP}`}
              >
                Safety
              </TableHead>
              <TableHead
                colSpan={8}
                className={`text-center text-[10px] uppercase tracking-wider text-muted-foreground font-normal ${SEP}`}
              >
                Delivery Quality
              </TableHead>
            </TableRow>
            {/* Per-metric column headers */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 bg-card z-10 text-center">
                Week
              </TableHead>
              {/* Standing */}
              <TableHead className="text-center">Tier</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              {/* Safety */}
              <TableHead className={`text-right ${SEP}`}>FICO</TableHead>
              <TableHead className="text-right">Seatbelt off</TableHead>
              <TableHead className="text-right">Speeding</TableHead>
              <TableHead className="text-right">Distractions</TableHead>
              <TableHead className="text-right">Following dist.</TableHead>
              <TableHead className="text-right">Sign/signal</TableHead>
              {/* Delivery Quality */}
              <TableHead className={`text-right ${SEP}`}>CDF DPMO</TableHead>
              <TableHead className="text-right">CED</TableHead>
              <TableHead className="text-right">DCR</TableHead>
              <TableHead className="text-right">DSB</TableHead>
              <TableHead className="text-right">DSB count</TableHead>
              <TableHead className="text-right">POD</TableHead>
              <TableHead className="text-right">POD opps</TableHead>
              <TableHead className="text-right">PSB</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scorecards.map((s) => {
              const { week, year } = amazonWeekFromEndingDate(s.week_ending);
              return (
                <TableRow key={s.id}>
                  <TableCell
                    className="sticky left-0 bg-card font-medium z-10"
                    title={`Week ending ${formatSessionDate(s.week_ending)}`}
                  >
                    {week}, {year}
                  </TableCell>
                  {/* Standing */}
                  <TableCell className="text-center">
                    <TierBadge tier={(s.tier as Tier | null) ?? null} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.overall_score === null ||
                    s.overall_score === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      s.overall_score.toFixed(1)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.delivered)}
                  </TableCell>
                  {/* Safety */}
                  <TableCell className={`text-right ${SEP}`}>
                    {fmt(s.fico_score)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.seatbelt_off_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.speeding_event_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.distractions_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.following_distance_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.sign_signal_violations_rate)}
                  </TableCell>
                  {/* Delivery Quality */}
                  <TableCell className={`text-right ${SEP}`}>
                    {fmt(s.cdf)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(s.ced)}</TableCell>
                  <TableCell className="text-right">
                    {fmt(s.dcr, "%")}
                  </TableCell>
                  <TableCell className="text-right">{fmt(s.dsb)}</TableCell>
                  <TableCell className="text-right">
                    {fmt(s.dsb_count)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.pod, "%")}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmt(s.pod_opps)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(s.psb)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {podLatest && podLatest.rejects > 0 && (
          <PodCard podLatest={podLatest} podBreakdown={podBreakdown} />
        )}
        {concessions.length > 0 && (
          <ConcessionsCard
            total={concessions.length}
            dsbCount={concDsbCount}
            typeBreakdown={concTypeBreakdown}
          />
        )}
        {cdfRows.length > 0 && (
          <CdfCard groups={cdfGroups} totalRows={cdfRows.length} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components — shared between the main render and the no-scorecard
// "Recent activity" fallback.
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums text-lg">{value}</div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function PodCard({
  podLatest,
  podBreakdown,
}: {
  podLatest: NonNullable<Awaited<ReturnType<typeof getLatestPodDetails>>>;
  podBreakdown: { label: string; count: number }[];
}) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">POD reject breakdown</h3>
        <span className="text-xs text-muted-foreground">
          Week {amazonWeekFromEndingDate(podLatest.week_ending).week},{" "}
          {amazonWeekFromEndingDate(podLatest.week_ending).year}
        </span>
      </div>
      <div className="grid grid-cols-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Opportunities</div>
          <div className="tabular-nums">{podLatest.opportunities}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Success</div>
          <div className="tabular-nums">{podLatest.success}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Rejects</div>
          <div className="tabular-nums text-rose-700 dark:text-rose-400">
            {podLatest.rejects}
          </div>
        </div>
      </div>
      {podBreakdown.length > 0 && (
        <ul className="space-y-1 text-sm border-t pt-2">
          {podBreakdown.map((c) => (
            <li
              key={c.label}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="text-foreground/80">{c.label}</span>
              <span className="tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConcessionsCard({
  total,
  dsbCount,
  typeBreakdown,
}: {
  total: number;
  dsbCount: number;
  typeBreakdown: { label: string; count: number }[];
}) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Concessions</h3>
        <span className="text-xs text-muted-foreground">all weeks on file</span>
      </div>
      <div className="grid grid-cols-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="tabular-nums">{total}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Impacts DSB</div>
          <div className="tabular-nums text-rose-700 dark:text-rose-400">
            {dsbCount}
          </div>
        </div>
      </div>
      {typeBreakdown.length > 0 && (
        <ul className="space-y-1 text-sm border-t pt-2">
          {typeBreakdown.map((c) => (
            <li
              key={c.label}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="text-foreground/80">{c.label}</span>
              <span className="tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CdfCard({
  groups,
  totalRows,
}: {
  groups: {
    type: string;
    items: { id: string; tracking_id: string; date: string }[];
  }[];
  totalRows: number;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4 md:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">
          Negative Customer Delivery Feedback
        </h3>
        <span className="text-xs text-muted-foreground">
          {totalRows} {totalRows === 1 ? "row" : "rows"} on file
        </span>
      </div>
      <div className="space-y-4 border-t pt-3">
        {groups.map((g) => (
          <div key={g.type} className="space-y-1">
            <h4 className="text-sm font-medium flex items-baseline gap-2">
              <span>{g.type}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({g.items.length})
              </span>
            </h4>
            <ul className="text-xs divide-y">
              {g.items.map((item) => (
                <li
                  key={`${g.type}-${item.id}`}
                  className="flex items-baseline justify-between gap-3 py-1 pl-3"
                >
                  <code className="font-mono">{item.tracking_id}</code>
                  <time
                    dateTime={item.date}
                    className="text-muted-foreground tabular-nums"
                  >
                    {formatSessionDate(item.date.slice(0, 10))}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

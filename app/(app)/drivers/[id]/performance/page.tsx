import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listScorecardsForDriver } from "@/lib/queries/scorecards";
import {
  getLatestPodDetails,
  podRejectBreakdown,
} from "@/lib/queries/pod-details";
import { listDefectsForDriver } from "@/lib/queries/defects";
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

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverPerformancePage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const [scorecards, podLatest, defects] = await Promise.all([
    listScorecardsForDriver(id),
    getLatestPodDetails(id),
    listDefectsForDriver(id),
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
  const cdfTypeCounts = new Map<string, number>();
  for (const c of cdfRows) {
    for (const t of c.feedback_types ?? [])
      cdfTypeCounts.set(t, (cdfTypeCounts.get(t) ?? 0) + 1);
  }
  const cdfTypeBreakdown = [...cdfTypeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  if (scorecards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No scorecards yet for {driver.full_name}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a weekly scorecard PDF or DSP Overview CSV on the{" "}
          <a href="/import" className="underline-offset-4 hover:underline">
            Import
          </a>{" "}
          page.
        </p>
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
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {scorecards.length} {scorecards.length === 1 ? "week" : "weeks"} on
        record. Scroll horizontally for all metrics. Trend chart ships in
        build order step&nbsp;8.
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
      )}

      {concessions.length > 0 && (
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">Concessions</h3>
            <span className="text-xs text-muted-foreground">
              all weeks on file
            </span>
          </div>
          <div className="grid grid-cols-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="tabular-nums">{concessions.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Impacts DSB
              </div>
              <div className="tabular-nums text-rose-700 dark:text-rose-400">
                {concDsbCount}
              </div>
            </div>
          </div>
          {concTypeBreakdown.length > 0 && (
            <ul className="space-y-1 text-sm border-t pt-2">
              {concTypeBreakdown.map((c) => (
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
      )}

      {cdfRows.length > 0 && (
        <section className="rounded-xl border bg-card p-4 space-y-3 md:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">
              Negative Customer Delivery Feedback
            </h3>
            <span className="text-xs text-muted-foreground">
              {cdfRows.length} {cdfRows.length === 1 ? "row" : "rows"} on file
            </span>
          </div>
          {cdfTypeBreakdown.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm border-t pt-2">
              {cdfTypeBreakdown.map((c) => (
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
          <ul className="border-t pt-2 text-sm divide-y">
            {cdfRows.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <code className="font-mono text-xs">{c.tracking_id}</code>
                <time
                  dateTime={c.date}
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {formatSessionDate(c.date.slice(0, 10))}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}

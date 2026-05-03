import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listScorecardsForDriver } from "@/lib/queries/scorecards";
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

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverPerformancePage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const scorecards = await listScorecardsForDriver(id);

  if (scorecards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No scorecards yet for {driver.full_name}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a weekly scorecard PDF on the{" "}
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

  // Column order mirrors the scorecard PDF layout. Two visual groups —
  // Safety and Delivery Quality — separated by a thin left border on the
  // first column of each group.
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
            {/* Group labels row */}
            <TableRow>
              <TableHead
                rowSpan={2}
                className="sticky left-0 bg-card z-10 align-bottom"
              >
                Week
              </TableHead>
              <TableHead
                rowSpan={2}
                className="text-right align-bottom"
              >
                Delivered
              </TableHead>
              <TableHead
                colSpan={6}
                className="text-center border-l text-[10px] uppercase tracking-wider text-muted-foreground font-normal"
              >
                Safety
              </TableHead>
              <TableHead
                colSpan={8}
                className="text-center border-l text-[10px] uppercase tracking-wider text-muted-foreground font-normal"
              >
                Delivery Quality
              </TableHead>
            </TableRow>
            {/* Per-metric column headers */}
            <TableRow>
              {/* Safety */}
              <TableHead className="text-right border-l">FICO</TableHead>
              <TableHead className="text-right">Seatbelt off</TableHead>
              <TableHead className="text-right">Speeding</TableHead>
              <TableHead className="text-right">Distractions</TableHead>
              <TableHead className="text-right">Following dist.</TableHead>
              <TableHead className="text-right">Sign/signal</TableHead>
              {/* Delivery Quality */}
              <TableHead className="text-right border-l">CDF DPMO</TableHead>
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
                  <TableCell className="text-right">
                    {fmt(s.delivered)}
                  </TableCell>
                  {/* Safety */}
                  <TableCell className="text-right border-l">
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
                  <TableCell className="text-right border-l">
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
    </div>
  );
}

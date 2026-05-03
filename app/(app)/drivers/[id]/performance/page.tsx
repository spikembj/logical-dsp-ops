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

  // Two visual groups (Safety, Delivery Quality), separated by a vertical
  // divider running through both header rows and every body row.
  //
  // The divider is a pseudo-element instead of a real border-l so it can
  // inset itself from the row's top/bottom borders — no T-intersections
  // where the column rule meets the horizontal row rule.
  //
  // bg-foreground/15 (translucent) gives enough contrast on both light and
  // dark backgrounds without being heavy.
  //
  // Header rows get hover:bg-transparent to avoid shadcn's default
  // row-highlight on hover.

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
            {/* Group-label row: blank over Week + Delivered, then Safety + Quality. */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 bg-card z-10" />
              <TableHead />
              <TableHead
                colSpan={6}
                className={`text-center text-[10px] uppercase tracking-wider text-muted-foreground font-normal relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}
              >
                Safety
              </TableHead>
              <TableHead
                colSpan={8}
                className={`text-center text-[10px] uppercase tracking-wider text-muted-foreground font-normal relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}
              >
                Delivery Quality
              </TableHead>
            </TableRow>
            {/* Per-metric column headers */}
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 bg-card z-10 text-center">
                Week
              </TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              {/* Safety */}
              <TableHead className={`text-right relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}>FICO</TableHead>
              <TableHead className="text-right">Seatbelt off</TableHead>
              <TableHead className="text-right">Speeding</TableHead>
              <TableHead className="text-right">Distractions</TableHead>
              <TableHead className="text-right">Following dist.</TableHead>
              <TableHead className="text-right">Sign/signal</TableHead>
              {/* Delivery Quality */}
              <TableHead className={`text-right relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}>CDF DPMO</TableHead>
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
                  <TableCell className={`text-right relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}>
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
                  <TableCell className={`text-right relative before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-foreground/15 before:content-['']`}>
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

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-role";
import { getDriverById, getLatestScorecard } from "@/lib/queries/drivers";
import { StatusBadge, TierBadge } from "@/lib/format/badges";
import { DriverTabs } from "@/components/app/driver-tabs";
import {
  amazonWeekFromEndingDate,
} from "@/lib/format/dates";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function DriverLayout({ params, children }: Props) {
  await requireUser();
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const latest = await getLatestScorecard(id);
  const latestWeekLabel = latest
    ? (() => {
        const { week, year } = amazonWeekFromEndingDate(latest.week_ending);
        return `Week ${week}, ${year}`;
      })()
    : null;

  return (
    <div className="space-y-6">
      {/* Header strip — always visible across all tabs */}
      <header className="space-y-3">
        <div>
          <Link
            href="/drivers"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Drivers
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {driver.full_name}
          </h1>
          {driver.position === "helper" && (
            <span className="text-[10px] uppercase tracking-wider rounded bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 px-1.5 py-0.5">
              Helper
            </span>
          )}
          <StatusBadge status={driver.status} />
          <TierBadge tier={latest?.tier ?? null} />
          {latest?.overall_score !== null && latest?.overall_score !== undefined && (
            <span
              className="text-xs text-muted-foreground tabular-nums"
              title={latestWeekLabel ?? undefined}
            >
              Score {latest.overall_score.toFixed(1)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Last coached: —
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground break-all">
          {driver.transporter_id ?? (
            <span className="italic">No transporter ID yet</span>
          )}
        </div>
      </header>

      <DriverTabs driverId={driver.id} />

      <section>{children}</section>
    </div>
  );
}

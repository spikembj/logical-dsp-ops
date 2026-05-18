import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { formatSessionDate, todayIso } from "@/lib/format/dates";
import { getDutiesForPeriod } from "@/lib/queries/daily-ops";
import {
  periodKeyFor,
  type DutiesCadence,
} from "@/lib/queries/daily-ops-types";
import { DutiesChecklist } from "@/components/app/daily-ops/duties-checklist";

interface PageProps {
  searchParams: Promise<{ cadence?: string; date?: string }>;
}

/**
 * HR-specific duties checklist. Same engine as `/duties` (same tables,
 * actions, period-key logic, optimistic checkbox UI) but filtered to
 * `scope='hr'` so HR sees only their tasks and dispatch never sees
 * HR's.
 *
 * Management-only — the parent /hr middleware gate prevents dispatchers
 * from reaching this route. requireManagement() is the belt-and-braces
 * server-side check.
 *
 * Daily is rendered as one flat list (flatList=true) — the dispatch
 * preload/loadout/etc. groups are not meaningful for HR.
 */
export default async function HrDutiesPage({ searchParams }: PageProps) {
  await requireManagement();
  const params = await searchParams;
  const cadence: DutiesCadence =
    params.cadence === "weekly" || params.cadence === "monthly"
      ? params.cadence
      : "daily";

  // Daily can be back-dated via ?date=YYYY-MM-DD. Weekly/monthly always
  // reflect the current period.
  const dailyDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();
  const periodDate =
    cadence === "daily" ? new Date(`${dailyDate}T12:00:00Z`) : new Date();
  const periodKey = periodKeyFor(periodDate, cadence);

  const items = await getDutiesForPeriod(cadence, periodKey, "hr");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HR Duties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cadence === "daily" && `Daily · ${formatSessionDate(dailyDate)}`}
            {cadence === "weekly" && `Weekly · ${periodKey}`}
            {cadence === "monthly" && `Monthly · ${periodKey}`}
            {" · "}
            {items.filter((i) => i.completion).length}/{items.length} done
          </p>
        </div>
        <Link
          href="/hr"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to HR
        </Link>
      </div>

      {/* Cadence tabs — match /duties for muscle memory. */}
      <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
        {(["daily", "weekly", "monthly"] as DutiesCadence[]).map((c) => (
          <Link
            key={c}
            href={`/hr/duties?cadence=${c}`}
            className={
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm transition-colors " +
              (c === cadence
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {c[0]!.toUpperCase() + c.slice(1)}
          </Link>
        ))}
      </div>

      <DutiesChecklist
        cadence={cadence}
        periodKey={periodKey}
        items={items}
        // Management is the only audience here; gating allows writes
        // and template edits without further role checks.
        canWrite={true}
        canManage={true}
        scope="hr"
        flatList
      />
    </div>
  );
}

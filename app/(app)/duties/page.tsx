import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/require-role";
import { isManagement, type UserRole } from "@/lib/types/database";
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
 * Recurring duties checklist. Three cadences (daily / weekly / monthly).
 * Daily defaults to today, weekly to this week's ISO Monday-Sunday,
 * monthly to this month. Dispatchers + management can tick items.
 *
 * Items reset each period — last week's checks don't carry over.
 * Template is editable at /admin/duties (management only).
 */
export default async function DutiesPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const params = await searchParams;
  const cadence: DutiesCadence =
    params.cadence === "weekly" || params.cadence === "monthly"
      ? params.cadence
      : "daily";

  const canManage = isManagement(me.role as UserRole);
  const canWrite =
    canManage ||
    (["dispatcher", "admin", "manager"] as UserRole[]).includes(
      me.role as UserRole,
    );

  // For daily, allow ?date= to jump to a specific day; weekly + monthly
  // are always "current period" (looking at past completions makes
  // sense for an audit feature we can add later).
  const dailyDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();
  const periodDate =
    cadence === "daily" ? new Date(`${dailyDate}T12:00:00Z`) : new Date();
  const periodKey = periodKeyFor(periodDate, cadence);

  const items = await getDutiesForPeriod(cadence, periodKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Duties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {cadence === "daily" && `Daily · ${formatSessionDate(dailyDate)}`}
            {cadence === "weekly" && `Weekly · ${periodKey}`}
            {cadence === "monthly" && `Monthly · ${periodKey}`}
            {" · "}
            {items.filter((i) => i.completion).length}/{items.length} done
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/daily"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Daily Ops
          </Link>
          {canManage && (
            <Link
              href="/admin/duties"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-card hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4" />
              Edit list
            </Link>
          )}
        </div>
      </div>

      {/* Cadence tabs */}
      <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
        {(["daily", "weekly", "monthly"] as DutiesCadence[]).map((c) => (
          <Link
            key={c}
            href={`/duties?cadence=${c}`}
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
        canWrite={canWrite}
      />
    </div>
  );
}

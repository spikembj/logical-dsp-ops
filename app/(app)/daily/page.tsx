import { Clock, ClipboardCheck, ListChecks, Printer } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-role";
import { isManagement, type UserRole } from "@/lib/types/database";
import { todayIso, formatSessionDate } from "@/lib/format/dates";
import {
  getRosterForDate,
  listWaveTimes,
  getMostRecentRosterDate,
  getMostRecentDriverByVehicle,
} from "@/lib/queries/daily-ops";
import { listDrivers } from "@/lib/queries/drivers";
import { listVehicles } from "@/lib/queries/fleet";
import { DateNav } from "@/components/app/daily-ops/date-nav";
import { DailyRoster } from "@/components/app/daily-ops/daily-roster";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

/**
 * Dispatcher daily workspace. Defaults to today; ?date=YYYY-MM-DD jumps
 * to another day. Read-everyone, write-operations (dispatcher + mgmt).
 *
 * Designed to be the page open on the dispatch computer all morning.
 * Inline edits, fast pickers, "copy from yesterday" to seed.
 */
export default async function DailyOpsPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const params = await searchParams;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();

  const canManage = isManagement(me.role as UserRole);
  const canWrite =
    canManage ||
    (["dispatcher", "admin", "manager"] as UserRole[]).includes(
      me.role as UserRole,
    );

  const [roster, waveTimes, drivers, vehicles, prevDate, lastDriverByVehicle] =
    await Promise.all([
      getRosterForDate(date),
      listWaveTimes(),
      listDrivers(),
      listVehicles(),
      getMostRecentRosterDate(date),
      getMostRecentDriverByVehicle(date),
    ]);

  // Picker pools: drivers must be active + position=driver; vans must be
  // operational. We do NOT remove already-rostered drivers/vans here —
  // the edit dialog needs to show them as already-selected. The dialog
  // handles "this row's current value stays visible" filtering.
  const driverPool = drivers
    .filter((d) => d.status === "active" && d.position === "driver")
    .map((d) => ({ id: d.id, full_name: d.full_name }));
  // Natural sort by vehicle name so 1, 2, 10 land in numeric order before
  // CDV1, CDV2, then R-prefixed Rivians. Matches the dispatcher's existing
  // mental model from the spreadsheet.
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const vehiclePool = vehicles
    .filter((v) => v.operational_status === "operational")
    .map((v) => ({
      id: v.id,
      vehicle_name: v.vehicle_name ?? v.vin,
      vin: v.vin,
    }))
    .sort((a, b) => collator.compare(a.vehicle_name, b.vehicle_name));
  const activeWaves = waveTimes.filter((w) => w.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Ops</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatSessionDate(date)} · {roster.length}{" "}
            {roster.length === 1 ? "assignment" : "assignments"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/duties"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ListChecks className="h-4 w-4" />
            Duties
          </Link>
          <Link
            href={`/daily/eod?date=${date}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ClipboardCheck className="h-4 w-4" />
            End of day
          </Link>
          <Link
            href={`/daily/paper?date=${date}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" />
            Daily Paper
          </Link>
          {canManage && (
            <Link
              href="/admin/waves"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Clock className="h-4 w-4" />
              Wave times
            </Link>
          )}
        </div>
      </div>

      <DateNav date={date} />

      <DailyRoster
        date={date}
        roster={roster}
        waves={activeWaves}
        drivers={driverPool}
        vehicles={vehiclePool}
        canWrite={canWrite}
        prevDate={prevDate}
        lastDriverByVehicle={Object.fromEntries(lastDriverByVehicle)}
      />
    </div>
  );
}

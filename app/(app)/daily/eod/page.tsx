import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require-role";
import {
  isManagement,
  MANAGEMENT_ROLES,
  type UserRole,
} from "@/lib/types/database";
import { todayIso, formatSessionDate } from "@/lib/format/dates";
import { getDailyReport, listEodNotesForDate } from "@/lib/queries/daily-ops";
import { listUsers } from "@/lib/queries/users";
import { listDrivers } from "@/lib/queries/drivers";
import { listVehicles } from "@/lib/queries/fleet";
import { EodForm } from "@/components/app/daily-ops/eod-form";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

/**
 * End-of-day report. One row per date capturing the structured summary
 * the dispatchers fill in at end of day: route counts, camera hits,
 * late drivers, dispatchers on shift, incidents, next-day capacity,
 * plus per-van notes that auto-flow into the issues tracker.
 *
 * Replaces the bottom half of the DUT7 Accountability Sheet.
 */
export default async function EodPage({ searchParams }: PageProps) {
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

  const [report, eodNotes, users, drivers, vehicles] = await Promise.all([
    getDailyReport(date),
    listEodNotesForDate(date),
    listUsers(),
    listDrivers(),
    listVehicles(),
  ]);

  // Dispatchers pool = active users with operations role
  // (management OR dispatcher).
  const dispatcherPool = users
    .filter(
      (u) =>
        u.active &&
        ((MANAGEMENT_ROLES as readonly string[]).includes(u.role) ||
          u.role === "dispatcher"),
    )
    .map((u) => ({
      id: u.id,
      label: u.full_name || u.email,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Drivers pool for "after 8pm" — active drivers, position=driver only.
  const driverPool = drivers
    .filter((d) => d.status === "active" && d.position === "driver")
    .map((d) => ({ id: d.id, label: d.full_name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Vehicles pool for per-van notes — ALL vans, not just operational.
  // A newly-grounded van often needs a note explaining why.
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const vehiclePool = vehicles
    .map((v) => ({
      id: v.id,
      label: v.vehicle_name ?? v.vin,
      vin: v.vin,
      grounded: v.operational_status !== "operational",
    }))
    .sort((a, b) => collator.compare(a.label, b.label));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            End of day
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatSessionDate(date)} · changes save automatically
          </p>
        </div>
        <Link
          href={`/daily?date=${date}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to roster
        </Link>
      </div>

      <EodForm
        date={date}
        report={report}
        eodNotes={eodNotes}
        dispatchers={dispatcherPool}
        drivers={driverPool}
        vehicles={vehiclePool}
        canWrite={canWrite}
      />
    </div>
  );
}

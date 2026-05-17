import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Wrench, MapPin, ArrowRight } from "lucide-react";
import {
  getFleetDashboardData,
  daysUntilExpiry,
  type VehicleListItem,
} from "@/lib/queries/fleet";
import { VehicleTile } from "@/components/app/fleet/vehicle-tile";
import { cn } from "@/lib/utils";

/**
 * Fleet dashboard. Pattern-matches the Performance dashboard:
 * - 4 clickable stat tiles with popovers
 * - hero list(s) below
 * - registration roster at the bottom
 *
 * Scope is intentionally narrow — we surface only the gaps Amazon's
 * dashboard leaves: status (with manual overrides), registration expiry,
 * shop location, and our own issue/parts tracker.
 */
export default async function FleetPage() {
  const { vehicles, totals, byShop, openIssues } = await getFleetDashboardData();

  const operationalList: VehicleListItem[] = vehicles.filter(
    (v) => v.operational_status === "operational",
  );
  const groundedList: VehicleListItem[] = vehicles.filter(
    (v) => v.operational_status !== "operational",
  );
  const expiringList: VehicleListItem[] = vehicles
    .filter((v) => {
      const d = daysUntilExpiry(v.registration_expiry_date);
      return d !== null && d <= 60;
    })
    .sort(
      (a, b) =>
        (daysUntilExpiry(a.registration_expiry_date) ?? 0) -
        (daysUntilExpiry(b.registration_expiry_date) ?? 0),
    );
  const openIssuesList: VehicleListItem[] = vehicles.filter(
    (v) => v.open_issues_count > 0,
  );

  const formatExpiryHint = (iso: string | null): string => {
    if (!iso) return "no date";
    const days = daysUntilExpiry(iso) ?? 0;
    if (days < 0) return `expired ${Math.abs(days)}d ago`;
    if (days === 0) return "expires today";
    return `${days}d`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totals.total} vehicles · {totals.operational} operational ·{" "}
            {totals.grounded} grounded
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/fleet/vans"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            All vans
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link
            href="/fleet/qr-sheet"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            QR sheet
          </Link>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <VehicleTile
          label="Operational"
          count={totals.operational}
          accent="good"
          dialogTitle="Operational vehicles"
          dialogDescription="Vans currently in service per Amazon (or manually marked operational)."
          vehicles={operationalList.map((v) => ({
            vin: v.vin,
            name: v.vehicle_name || v.vin,
            hint:
              v.operational_status_source === "manual" ? "manual" : undefined,
          }))}
        />
        <VehicleTile
          label="Grounded"
          count={totals.grounded}
          accent={totals.grounded > 0 ? "warn" : "default"}
          dialogTitle="Grounded vehicles"
          dialogDescription="Includes GROUNDED and READY_FOR_AUDIT. Amazon's reason is in the van's status note."
          vehicles={groundedList.map((v) => ({
            vin: v.vin,
            name: v.vehicle_name || v.vin,
            hint: v.status_reason_message || v.operational_status,
          }))}
        />
        <VehicleTile
          label="Registration expiring"
          count={totals.registration_expiring}
          accent={totals.registration_expiring > 0 ? "warn" : "good"}
          tileHint="Next 60 days (incl. expired)"
          dialogTitle="Vehicles needing registration soon"
          dialogDescription="Renewals due within 60 days. Already-expired vans listed first."
          vehicles={expiringList.map((v) => ({
            vin: v.vin,
            name: v.vehicle_name || v.vin,
            hint: formatExpiryHint(v.registration_expiry_date),
          }))}
        />
        <VehicleTile
          label="Open issues"
          count={totals.open_issues_distinct_vehicles}
          accent={
            totals.open_issues_distinct_vehicles > 0 ? "warn" : "good"
          }
          tileHint="Distinct vans with at least one open issue"
          dialogTitle="Vehicles with open issues"
          vehicles={openIssuesList.map((v) => ({
            vin: v.vin,
            name: v.vehicle_name || v.vin,
            hint: `${v.open_issues_count} open`,
          }))}
        />
      </div>

      {/* Heroes: In the shop + Open issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ShopHero byShop={byShop} />
        <OpenIssuesHero issues={openIssues} />
      </div>

      {/* Registration roster */}
      <RegistrationRoster vehicles={vehicles} />
    </div>
  );
}

function ShopHero({
  byShop,
}: {
  byShop: Map<string, VehicleListItem[]>;
}) {
  const shops = [...byShop.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">In the shop</h2>
      </div>
      {shops.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          No vans flagged as in a shop. Set{" "}
          <code className="font-mono text-[11px]">Current shop</code> on a
          van's overview to track it here.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {shops.map(([shop, vans]) => (
            <li key={shop} className="px-3 py-2">
              <details>
                <summary className="cursor-pointer text-sm flex items-center justify-between">
                  <span className="font-medium">{shop}</span>
                  <span className="text-xs text-muted-foreground">
                    {vans.length} van{vans.length === 1 ? "" : "s"}
                  </span>
                </summary>
                <ul className="mt-2 pl-4 space-y-1">
                  {vans.map((v) => (
                    <li key={v.vin} className="text-sm">
                      <Link
                        href={`/fleet/vans/${v.vin}`}
                        className="hover:underline"
                      >
                        {v.vehicle_name || v.vin}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenIssuesHero({
  issues,
}: {
  issues: { id: string; vehicle_id: string; description: string; severity: string; reported_at: string; auto_created: boolean; vehicle: VehicleListItem }[];
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Open issues</h2>
      </div>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          No open issues. ✓
        </p>
      ) : (
        <ul className="divide-y rounded-md border max-h-96 overflow-y-auto">
          {issues.map((i) => (
            <li key={i.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/fleet/vans/${i.vehicle.vin}`}
                  className="text-sm font-medium hover:underline truncate"
                >
                  {i.vehicle.vehicle_name || i.vehicle.vin}
                </Link>
                <SeverityBadge severity={i.severity} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {i.description}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {format(parseISO(i.reported_at), "MMM d, yyyy")}
                {i.auto_created && " · auto"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    minor: "bg-muted text-muted-foreground",
    moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    major: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    out_of_service:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
        styles[severity] ?? styles.minor,
      )}
    >
      {severity.replace(/_/g, " ")}
    </span>
  );
}

function RegistrationRoster({ vehicles }: { vehicles: VehicleListItem[] }) {
  const sorted = [...vehicles]
    .filter((v) => v.registration_expiry_date)
    .sort((a, b) =>
      (a.registration_expiry_date ?? "").localeCompare(
        b.registration_expiry_date ?? "",
      ),
    );

  if (sorted.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Registration roster</h2>
        <p className="text-sm text-muted-foreground py-3">
          No registration data. Import the Vehicles xlsx to populate.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Registration roster</h2>
        <Link
          href="/fleet/vans"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          All vans <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted-foreground text-left border-b">
              <th className="py-2 pr-3 font-normal">Vehicle</th>
              <th className="py-2 pr-3 font-normal">State</th>
              <th className="py-2 pr-3 font-normal">Expires</th>
              <th className="py-2 font-normal">Days</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((v) => {
              const days = daysUntilExpiry(v.registration_expiry_date) ?? 0;
              const chip =
                days < 30
                  ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                  : days < 60
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
              return (
                <tr key={v.id}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/fleet/vans/${v.vin}`}
                      className="hover:underline font-medium"
                    >
                      {v.vehicle_name || v.vin}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {v.registered_state ?? "—"}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {v.registration_expiry_date
                      ? format(
                          parseISO(v.registration_expiry_date),
                          "MMM d, yyyy",
                        )
                      : "—"}
                  </td>
                  <td className="py-2">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
                        chip,
                      )}
                    >
                      {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                    </span>
                    {days < 0 && (
                      <AlertTriangle className="inline-block h-3 w-3 ml-1 text-red-600" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

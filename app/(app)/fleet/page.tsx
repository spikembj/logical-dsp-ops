import Link from "next/link";
import { format, parseISO } from "date-fns";
import { List, MapPin, QrCode, Store, Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth/require-role";
import { isManagement, type UserRole } from "@/lib/types/database";
import {
  getFleetDashboardData,
  getPaveStatusForQuarter,
  listAllVehicleParts,
  daysUntilExpiry,
  type VehicleListItem,
  type VehiclePartWithVehicle,
} from "@/lib/queries/fleet";
import { bucketFor, quarterOf } from "@/lib/queries/fleet-types";
import { VehicleTile } from "@/components/app/fleet/vehicle-tile";
import { DualVehicleTile } from "@/components/app/fleet/dual-vehicle-tile";
import { PaveTile } from "@/components/app/fleet/pave-tile";
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
  const me = await requireUser();
  const canManage = isManagement(me.role as UserRole);
  const [{ vehicles, totals, byShop, openIssues }, allParts] =
    await Promise.all([getFleetDashboardData(), listAllVehicleParts()]);

  // Quarterly PAVE roster, computed at request time. Operational vans only —
  // grounded vans can't be inspected and we don't want them counted against us.
  const { quarter, year } = quarterOf(new Date());
  const paveCandidates = vehicles.filter(
    (v) => v.operational_status === "operational",
  );
  const paveStatusMap = await getPaveStatusForQuarter(
    paveCandidates.map((v) => v.id),
    quarter,
    year,
  );
  const paveRows = paveCandidates
    .map((v) => {
      const status = paveStatusMap.get(v.id)!;
      return { vehicle: v, status, bucket: bucketFor(status) };
    })
    .sort((a, b) => {
      // Order: needs_reinspect → not_done → done
      const rank: Record<string, number> = {
        needs_reinspect: 0,
        not_done: 1,
        done: 2,
      };
      const r = rank[a.bucket] - rank[b.bucket];
      if (r !== 0) return r;
      return (a.vehicle.vehicle_name || "").localeCompare(
        b.vehicle.vehicle_name || "",
      );
    });

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
        <h1 className="text-2xl font-semibold tracking-tight">Fleet</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/fleet/vans"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <List className="h-4 w-4" />
            All vans
          </Link>
          <Link
            href="/fleet/qr-sheet"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <QrCode className="h-4 w-4" />
            QR sheet
          </Link>
          {canManage && (
            <Link
              href="/admin/shops"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Store className="h-4 w-4" />
              Shops
            </Link>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DualVehicleTile
          left={{
            label: "Operational",
            count: totals.operational,
            accent: "good",
            dialogTitle: "Operational vehicles",
            dialogDescription:
              "Vans currently in service per Amazon (or manually marked operational).",
            vehicles: operationalList.map((v) => ({
              vin: v.vin,
              name: v.vehicle_name || v.vin,
              hint:
                v.operational_status_source === "manual"
                  ? "manual"
                  : undefined,
            })),
          }}
          right={{
            label: "Grounded",
            count: totals.grounded,
            accent: totals.grounded > 0 ? "warn" : "default",
            dialogTitle: "Grounded vehicles",
            dialogDescription:
              "Includes GROUNDED and READY_FOR_AUDIT. Amazon's reason is in the van's status note.",
            vehicles: groundedList.map((v) => ({
              vin: v.vin,
              name: v.vehicle_name || v.vin,
              hint: v.status_reason_message || v.operational_status,
            })),
          }}
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

      {/* Parts list */}
      <PartsList parts={allParts} />

      <PaveTile quarter={quarter} year={year} rows={paveRows} />
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

/**
 * Parts list — every parts row across the fleet. Open rows
 * (needed / ordered / partial) always visible; received / installed /
 * returned rows tucked behind a "Show N more" details toggle so the
 * dashboard isn't dominated by historical orders.
 */
function PartsList({ parts }: { parts: VehiclePartWithVehicle[] }) {
  if (parts.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Parts</h2>
        <p className="text-sm text-muted-foreground py-3">
          No parts logged yet. Order a part from any van&rsquo;s Parts tab
          and it shows up here.
        </p>
      </section>
    );
  }

  const OPEN: ReadonlySet<string> = new Set(["needed", "ordered", "partial"]);
  const open = parts.filter((p) => OPEN.has(p.status));
  const closed = parts.filter((p) => !OPEN.has(p.status));

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Parts</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {open.length} open · {parts.length} total
        </span>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 mb-2">
          ✓ Nothing on order or pending.
        </p>
      ) : (
        <PartsTable parts={open} />
      )}

      {closed.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
            <span className="group-open:hidden">
              Show {closed.length} more (received / installed / returned)
            </span>
            <span className="hidden group-open:inline">
              Hide {closed.length} more
            </span>
          </summary>
          <div className="mt-2">
            <PartsTable parts={closed} />
          </div>
        </details>
      )}
    </section>
  );
}

function PartsTable({ parts }: { parts: VehiclePartWithVehicle[] }) {
  const STATUS_CHIP: Record<string, string> = {
    needed:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    ordered:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    partial:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    received:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
    installed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    returned: "bg-muted text-muted-foreground",
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted-foreground text-left border-b">
            <th className="py-2 pr-3 font-normal">Van</th>
            <th className="py-2 pr-3 font-normal">Part</th>
            <th className="py-2 pr-3 font-normal">Qty</th>
            <th className="py-2 pr-3 font-normal">Status</th>
            <th className="py-2 pr-3 font-normal hidden md:table-cell">
              Vendor
            </th>
            <th className="py-2 font-normal hidden md:table-cell">Ordered</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {parts.map((p) => (
            <tr key={p.id} className="hover:bg-muted/30">
              <td className="py-2 pr-3">
                <Link
                  href={`/fleet/vans/${p.vehicle_vin}`}
                  className="hover:underline font-medium"
                >
                  {p.vehicle_name}
                </Link>
              </td>
              <td className="py-2 pr-3">
                <div className="font-medium">{p.part_name}</div>
                {p.part_number && (
                  <div className="text-[11px] text-muted-foreground font-mono">
                    #{p.part_number}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {p.quantity_ordered > 0 ? (
                  <>
                    {p.quantity_installed > 0 &&
                      `${p.quantity_installed} installed`}
                    {p.quantity_installed > 0 &&
                      p.quantity_received > p.quantity_installed &&
                      " · "}
                    {p.quantity_received > p.quantity_installed &&
                      `${p.quantity_received - p.quantity_installed} on hand`}
                    {(p.quantity_installed > 0 ||
                      p.quantity_received > p.quantity_installed) &&
                      p.quantity_ordered > p.quantity_received &&
                      " · "}
                    {p.quantity_ordered > p.quantity_received &&
                      `${p.quantity_ordered - p.quantity_received} pending`}
                    {p.quantity_installed === 0 &&
                      p.quantity_received === 0 &&
                      `${p.quantity_ordered} ordered`}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-3">
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
                    STATUS_CHIP[p.status] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {p.status}
                </span>
              </td>
              <td className="py-2 pr-3 hidden md:table-cell text-sm text-muted-foreground">
                {p.vendor ?? "—"}
              </td>
              <td className="py-2 hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                {p.ordered_at
                  ? format(parseISO(p.ordered_at), "MMM d, yyyy")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

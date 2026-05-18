import { requireManagement } from "@/lib/auth/require-role";
import { listVehicleShops } from "@/lib/queries/fleet";
import { ShopsAdmin } from "@/components/app/fleet/shops-admin";

/**
 * Manage the dropdown values used for each van's "Current shop /
 * location" field. Intentionally mixes real shop names with locations
 * (LGCL Parking Lot, DUT4) and states (Inactive, Return, Returned) —
 * matches the dispatcher's existing spreadsheet column.
 *
 * Deleting a shop is safe: vans currently pointing to it get
 * `current_shop_id` cleared via ON DELETE SET NULL. To temporarily
 * hide a shop without losing the assignments, toggle Active off.
 */
export default async function ShopsAdminPage() {
  await requireManagement();
  const shops = await listVehicleShops();
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shops</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Where a van can be right now. Picks from this list show up in
          each van&rsquo;s <em>Current shop / location</em> dropdown on
          the Fleet page. Drag rows to reorder the dropdown; click the
          Active chip to hide a shop without losing it.
        </p>
      </div>
      <ShopsAdmin shops={shops} />
    </div>
  );
}

import { requireUser } from "@/lib/auth/require-role";
import { listVehicles } from "@/lib/queries/fleet";
import { VehiclesTable } from "@/components/app/fleet/vehicles-table";

export default async function VehiclesListPage() {
  await requireUser();
  const vehicles = await listVehicles();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
        <p className="text-sm text-muted-foreground">
          {vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}
        </p>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No vehicles yet. Import the Amazon{" "}
          <code className="text-xs">VehiclesData.xlsx</code> from the Import
          page to seed the roster.
        </div>
      ) : (
        <VehiclesTable vehicles={vehicles} />
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-role";
import {
  getVehicleByVin,
  listVehicleIssues,
  listVehicleParts,
} from "@/lib/queries/fleet";
import { VehicleDetail } from "@/components/app/fleet/vehicle-detail";
import { VehicleQrButton } from "@/components/app/fleet/vehicle-qr-button";

export default async function VanDetailPage({
  params,
}: {
  params: Promise<{ vin: string }>;
}) {
  await requireUser();
  const { vin } = await params;
  const vehicle = await getVehicleByVin(vin);
  if (!vehicle) notFound();

  const [issues, parts] = await Promise.all([
    listVehicleIssues(vehicle.id),
    listVehicleParts(vehicle.id),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <Link
            href="/fleet/vans"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Vehicles
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {vehicle.vehicle_name || vehicle.vin}
          </h1>
          <div className="ml-auto">
            <VehicleQrButton
              vin={vehicle.vin}
              name={vehicle.vehicle_name}
              variant="default"
            />
          </div>
        </div>
      </header>

      <VehicleDetail vehicle={vehicle} issues={issues} parts={parts} />
    </div>
  );
}

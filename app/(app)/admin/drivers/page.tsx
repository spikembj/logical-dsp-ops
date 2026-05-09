import { requireManagement } from "@/lib/auth/require-role";
import { listDrivers } from "@/lib/queries/drivers";
import { DriversAdmin } from "@/components/app/admin/drivers-admin";

export default async function AdminDriversPage() {
  await requireManagement();
  const drivers = await listDrivers();
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Drivers (admin)
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add new drivers, edit any field, change status. Imports auto-create
          missing drivers; this page is for one-off adjustments.
        </p>
      </div>
      <DriversAdmin drivers={drivers} />
    </div>
  );
}

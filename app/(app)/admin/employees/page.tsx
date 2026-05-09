import { requireManagement } from "@/lib/auth/require-role";
import { listDrivers } from "@/lib/queries/drivers";
import { DriversAdmin } from "@/components/app/admin/drivers-admin";

export default async function EmployeesPage() {
  await requireManagement();
  const drivers = await listDrivers();
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add new employees, edit any field, change status. Imports auto-create
          missing drivers; this page is for one-off adjustments and for adding
          helpers (who don&apos;t appear in any import).
        </p>
      </div>
      <DriversAdmin drivers={drivers} />
    </div>
  );
}

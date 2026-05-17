import { requireUser } from "@/lib/auth/require-role";
import { listDrivers } from "@/lib/queries/drivers";
import { isManagement } from "@/lib/types/database";
import { DriversTable } from "@/components/app/drivers-table";

export default async function DriversPage() {
  const me = await requireUser();
  const drivers = await listDrivers();
  const canManage = isManagement(me.role);

  const driverCount = drivers.filter((d) => d.position === "driver").length;
  const helperCount = drivers.filter((d) => d.position === "helper").length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
        <p className="text-sm text-muted-foreground">
          {driverCount} {driverCount === 1 ? "driver" : "drivers"}
          {helperCount > 0 && (
            <>
              {" · "}
              {helperCount} {helperCount === 1 ? "helper" : "helpers"}
            </>
          )}
        </p>
      </div>

      {drivers.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No drivers yet. Run{" "}
          <code className="text-xs">supabase/seed-drivers.sql</code> in the
          Supabase SQL editor to load the initial roster.
        </div>
      ) : (
        <DriversTable drivers={drivers} canManage={canManage} />
      )}
    </div>
  );
}

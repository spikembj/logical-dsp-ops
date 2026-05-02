import { requireUser } from "@/lib/auth/require-role";
import { listDrivers } from "@/lib/queries/drivers";
import { DriversTable } from "@/components/app/drivers-table";

export default async function DriversPage() {
  await requireUser();
  const drivers = await listDrivers();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
        <p className="text-sm text-muted-foreground">
          {drivers.length} {drivers.length === 1 ? "driver" : "drivers"}
        </p>
      </div>

      {drivers.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No drivers yet. Run{" "}
          <code className="text-xs">supabase/seed-drivers.sql</code> in the
          Supabase SQL editor to load the initial roster.
        </div>
      ) : (
        <DriversTable drivers={drivers} />
      )}
    </div>
  );
}

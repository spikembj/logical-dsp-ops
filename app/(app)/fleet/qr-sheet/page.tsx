import { requireUser } from "@/lib/auth/require-role";
import { listVehicles } from "@/lib/queries/fleet";
import { QrSheet } from "@/components/app/fleet/qr-sheet";

export default async function QrSheetPage() {
  await requireUser();
  const vehicles = await listVehicles();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">QR sheet</h1>
        <p className="text-sm text-muted-foreground">
          {vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}
        </p>
      </div>
      <p className="text-sm text-muted-foreground print:hidden">
        Pick which vans to include, then use your browser's Print dialog (⌘P /
        Ctrl+P). Each QR encodes the plain VIN — directly scannable into
        Amazon's delivery app.
      </p>
      <QrSheet vehicles={vehicles} />
    </div>
  );
}

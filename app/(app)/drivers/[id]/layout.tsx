import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-role";
import { getDriverById } from "@/lib/queries/drivers";
import { StatusBadge, TierBadge } from "@/lib/format/badges";
import { DriverTabs } from "@/components/app/driver-tabs";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function DriverLayout({ params, children }: Props) {
  await requireUser();
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();

  return (
    <div className="space-y-6">
      {/* Header strip — always visible across all tabs */}
      <header className="space-y-3">
        <div>
          <Link
            href="/drivers"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Drivers
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {driver.full_name}
          </h1>
          <StatusBadge status={driver.status} />
          <TierBadge tier={null /* current week tier — populated in step 4 */} />
          <span className="text-xs text-muted-foreground">
            Last coached: —
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground break-all">
          {driver.transporter_id ?? (
            <span className="italic">No transporter ID yet</span>
          )}
        </div>
      </header>

      <DriverTabs driverId={driver.id} />

      <section>{children}</section>
    </div>
  );
}

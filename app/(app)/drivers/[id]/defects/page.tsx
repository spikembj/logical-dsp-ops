import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listDefectsForDriver } from "@/lib/queries/defects";
import { DefectsList } from "@/components/app/defects/defects-list";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverDefectsPage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const items = await listDefectsForDriver(id);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No defects recorded for {driver.full_name}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Concessions and CDF Negative imports show up here as they come in.
        </p>
      </div>
    );
  }

  return <DefectsList items={items} />;
}

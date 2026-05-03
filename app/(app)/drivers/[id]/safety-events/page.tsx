import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listEventsForDriver } from "@/lib/queries/safety-events";
import { SafetyEventList } from "@/components/app/safety-events/event-list";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverSafetyEventsPage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();
  const events = await listEventsForDriver(id);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No safety events recorded for {driver.full_name}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a Netradyne CSV on the{" "}
          <a href="/import" className="underline-offset-4 hover:underline">
            Import
          </a>{" "}
          page.
        </p>
      </div>
    );
  }

  return <SafetyEventList events={events} />;
}

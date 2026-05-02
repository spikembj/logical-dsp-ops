import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import { listSessionsForDriver } from "@/lib/queries/coaching";
import { LogSessionDialog } from "@/components/app/coaching/log-session-dialog";
import { SessionCard } from "@/components/app/coaching/session-card";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverCoachingPage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();

  const sessions = await listSessionsForDriver(id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Coaching history</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sessions.length === 0
              ? "No sessions yet."
              : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}, newest first.`}
          </p>
        </div>
        <LogSessionDialog driverId={driver.id} driverName={driver.full_name} />
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing logged for {driver.full_name} yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Log a session to start the coaching record.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

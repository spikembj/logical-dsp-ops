import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-role";
import { getDriverById } from "@/lib/queries/drivers";
import { listSessionsForDriver } from "@/lib/queries/coaching";
import { getDriverCoachingTriggers } from "@/lib/queries/coaching-triggers";
import { LogSessionDialog } from "@/components/app/coaching/log-session-dialog";
import { CoachingSessionList } from "@/components/app/coaching/session-list";
import { TriggersPanel } from "@/components/app/coaching/triggers-panel";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverCoachingPage({ params }: Props) {
  const { id } = await params;
  const me = await requireUser();
  const driver = await getDriverById(id);
  if (!driver) notFound();

  const [sessions, triggers] = await Promise.all([
    listSessionsForDriver(id),
    getDriverCoachingTriggers(id),
  ]);
  const activeCount = sessions.filter((s) => !s.voided_at).length;

  return (
    <div className="space-y-6">
      <TriggersPanel triggers={triggers} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Coaching history</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCount === 0
              ? "No sessions yet."
              : `${activeCount} ${activeCount === 1 ? "session" : "sessions"}, newest first.`}
          </p>
        </div>
        <LogSessionDialog
          driverId={driver.id}
          driverName={driver.full_name}
        />
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
        <CoachingSessionList
          sessions={sessions}
          driverName={driver.full_name}
          isAdmin={me.role === "admin"}
        />
      )}
    </div>
  );
}

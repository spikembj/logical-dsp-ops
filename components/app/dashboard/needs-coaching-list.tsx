import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LogSessionDialog } from "@/components/app/coaching/log-session-dialog";
import type { DashboardData } from "@/lib/queries/dashboard";

export function NeedsCoachingList({
  drivers,
}: {
  drivers: DashboardData["needsCoaching"];
}) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No drivers with uncoached impacting events this week. 🎉
        </p>
      </div>
    );
  }

  return (
    <ul className="rounded-xl border bg-card divide-y">
      {drivers.map((d) => (
        <li
          key={d.driver_id}
          className="flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <Link
              href={`/drivers/${d.driver_id}`}
              className="text-sm font-medium hover:underline"
            >
              {d.full_name}
            </Link>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {d.total_events} impacting{" "}
              {d.total_events === 1 ? "event" : "events"}
              {d.event_types.length > 0 && (
                <>
                  {" · "}
                  <span title={d.event_types.join(", ")}>
                    {d.event_types.slice(0, 3).join(", ")}
                    {d.event_types.length > 3 && ` +${d.event_types.length - 3}`}
                  </span>
                </>
              )}
            </div>
          </div>
          <LogSessionDialog
            driverId={d.driver_id}
            driverName={d.full_name}
          />
          <Link
            href={`/drivers/${d.driver_id}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Open ${d.full_name} profile`}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

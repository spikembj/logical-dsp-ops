import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { formatSessionDate, relativeFromNow } from "@/lib/format/dates";
import type { DashboardData } from "@/lib/queries/dashboard";

export function RecentActivity({
  sessions,
}: {
  sessions: DashboardData["recentSessions"];
}) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No coaching sessions yet.
        </p>
      </div>
    );
  }

  return (
    <ul className="rounded-xl border bg-card divide-y text-sm">
      {sessions.map((s) => {
        const driverName = s.driver?.full_name ?? "Unknown driver";
        const coachName =
          s.coached_by?.full_name?.trim() ||
          s.coached_by?.email ||
          "Unknown coach";
        return (
          <li key={s.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/drivers/${s.driver_id}/coaching`}
                className="font-medium hover:underline"
              >
                {driverName}
              </Link>
              <span
                className="text-xs text-muted-foreground shrink-0"
                title={new Date(s.created_at).toLocaleString()}
              >
                {relativeFromNow(s.created_at)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-foreground/80 truncate">
              {s.topic}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatSessionDate(s.session_date)}</span>
              <span aria-hidden>·</span>
              <span>by {coachName}</span>
              {s.acknowledged && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> ack
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

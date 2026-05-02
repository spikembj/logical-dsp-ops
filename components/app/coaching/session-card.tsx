"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { acknowledgeCoachingSession } from "@/app/actions/coaching";
import { formatSessionDate, relativeFromNow } from "@/lib/format/dates";
import type { CoachingSessionListItem } from "@/lib/queries/coaching";

export function SessionCard({
  session,
}: {
  session: CoachingSessionListItem;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAcknowledge() {
    startTransition(async () => {
      const res = await acknowledgeCoachingSession({
        session_id: session.id,
        driver_id: session.driver_id,
      });
      if (!res.ok) {
        toast.error(res.error || "Could not update.");
        return;
      }
      toast.success("Marked as acknowledged.");
      router.refresh();
    });
  }

  const coachLabel =
    session.coached_by?.full_name?.trim() ||
    session.coached_by?.email ||
    "Unknown coach";
  const wasEdited =
    new Date(session.updated_at).getTime() -
      new Date(session.created_at).getTime() >
    1000;

  return (
    <article className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <time
          dateTime={session.session_date}
          className="font-medium text-foreground"
        >
          {formatSessionDate(session.session_date)}
        </time>
        <span aria-hidden>·</span>
        <span>Coached by {coachLabel}</span>
        <span aria-hidden>·</span>
        <span title={new Date(session.created_at).toLocaleString()}>
          Logged {relativeFromNow(session.created_at)}
        </span>
        {wasEdited && (
          <>
            <span aria-hidden>·</span>
            <span
              className="italic"
              title={`Last edit: ${new Date(session.updated_at).toLocaleString()}`}
            >
              Edited
            </span>
          </>
        )}

        <span className="ml-auto flex items-center gap-1">
          {session.acknowledged ? (
            <span
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
              title={
                session.acknowledged_at
                  ? `Acknowledged ${new Date(session.acknowledged_at).toLocaleString()}`
                  : undefined
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledged
            </span>
          ) : (
            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={pending}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Circle className="h-3.5 w-3.5" />
              {pending ? "Saving..." : "Mark acknowledged"}
            </button>
          )}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium">{session.topic}</h3>
        {session.notes ? (
          <p className="text-sm text-foreground/80 whitespace-pre-line">
            {session.notes}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No notes recorded.
          </p>
        )}
      </div>
    </article>
  );
}

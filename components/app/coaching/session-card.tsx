"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, RotateCcw } from "lucide-react";
import {
  setCoachingAcknowledged,
  unvoidCoachingSession,
} from "@/app/actions/coaching";
import { formatSessionDate, relativeFromNow } from "@/lib/format/dates";
import type { CoachingSessionListItem } from "@/lib/queries/coaching";
import { LogSessionDialog } from "./log-session-dialog";
import { VoidSessionDialog } from "./void-session-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CoachingSessionType } from "@/lib/types/database";

const TYPE_LABEL: Record<CoachingSessionType, string> = {
  discussion: "Discussion",
  verbal_warning: "Verbal warning",
  write_up: "Write up",
  final_warning: "Final warning",
  termination: "Termination",
};

const TYPE_CLASS: Record<CoachingSessionType, string> = {
  discussion: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
  verbal_warning:
    "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  write_up:
    "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400",
  final_warning:
    "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400",
  termination:
    "bg-zinc-700/15 text-zinc-800 border-zinc-700/30 dark:bg-zinc-300/10 dark:text-zinc-200 dark:border-zinc-300/20",
};

interface Props {
  session: CoachingSessionListItem;
  driverName: string;
  isAdmin: boolean;
}

export function SessionCard({ session, driverName, isAdmin }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isVoided = !!session.voided_at;

  const coachLabel =
    session.coached_by?.full_name?.trim() ||
    session.coached_by?.email ||
    "Unknown coach";
  const voiderLabel =
    session.voided_by?.full_name?.trim() ||
    session.voided_by?.email ||
    "an admin";
  const wasEdited =
    !isVoided &&
    new Date(session.updated_at).getTime() -
      new Date(session.created_at).getTime() >
      1000;

  function handleAcknowledge(next: boolean) {
    startTransition(async () => {
      const res = await setCoachingAcknowledged({
        session_id: session.id,
        driver_id: session.driver_id,
        acknowledged: next,
      });
      if (!res.ok) {
        toast.error(res.error || "Could not update.");
        return;
      }
      toast.success(next ? "Marked as acknowledged." : "Acknowledgment cleared.");
      router.refresh();
    });
  }

  function handleUnvoid() {
    startTransition(async () => {
      const res = await unvoidCoachingSession({
        session_id: session.id,
        driver_id: session.driver_id,
      });
      if (!res.ok) {
        toast.error(res.error || "Could not unvoid.");
        return;
      }
      toast.success("Session restored.");
      router.refresh();
    });
  }

  return (
    <article
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm transition-opacity",
        isVoided && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <time
          dateTime={session.session_date}
          className={cn(
            "font-medium text-foreground",
            isVoided && "line-through",
          )}
        >
          {formatSessionDate(session.session_date)}
        </time>
        <span aria-hidden>·</span>
        <span className={cn(isVoided && "line-through")}>
          Coached by {coachLabel}
        </span>
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

        {!isVoided && (
          <span className="ml-auto flex items-center gap-1">
            {session.acknowledged ? (
              <button
                type="button"
                onClick={() => handleAcknowledge(false)}
                disabled={pending}
                className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:opacity-70 disabled:opacity-50"
                title={
                  session.acknowledged_at
                    ? `Acknowledged ${new Date(session.acknowledged_at).toLocaleString()} — click to clear`
                    : "Click to clear acknowledgment"
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Acknowledged
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAcknowledge(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Circle className="h-3.5 w-3.5" />
                {pending ? "Saving..." : "Mark acknowledged"}
              </button>
            )}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(TYPE_CLASS[session.session_type], "text-[11px]")}
          >
            {TYPE_LABEL[session.session_type]}
          </Badge>
          <h3
            className={cn(
              "text-sm font-medium",
              isVoided && "line-through",
            )}
          >
            {session.topic}
          </h3>
        </div>
        {session.notes ? (
          <p
            className={cn(
              "text-sm text-foreground/80 whitespace-pre-line",
              isVoided && "line-through",
            )}
          >
            {session.notes}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No notes recorded.
          </p>
        )}
      </div>

      {isVoided && (
        <div className="border-t px-4 py-2 text-xs">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-destructive">Voided</span>
            <span className="text-muted-foreground">
              by {voiderLabel}
              {session.voided_at &&
                ` · ${formatSessionDate(session.voided_at)}`}
            </span>
          </div>
          {session.void_reason && (
            <p className="mt-1 text-muted-foreground">
              <span className="font-medium">Reason:</span> {session.void_reason}
            </p>
          )}
        </div>
      )}

      {/* Footer: action affordances. Only render when there are actions. */}
      {(isAdmin || (!isVoided && false)) && (
        <div className="flex items-center justify-end gap-3 border-t px-4 py-2 bg-muted/30">
          {isAdmin && !isVoided && (
            <LogSessionDialog
              mode="edit"
              driverId={session.driver_id}
              driverName={driverName}
              session={{
                id: session.id,
                session_date: session.session_date,
                session_type: session.session_type,
                topic: session.topic,
                notes: session.notes,
                acknowledged: session.acknowledged,
                category: session.category,
              }}
            />
          )}
          {isAdmin && !isVoided && (
            <VoidSessionDialog
              sessionId={session.id}
              driverId={session.driver_id}
              topic={session.topic}
            />
          )}
          {isAdmin && isVoided && (
            <button
              type="button"
              onClick={handleUnvoid}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {pending ? "Restoring..." : "Restore (unvoid)"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

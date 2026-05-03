"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCoachingSession,
  updateCoachingSession,
} from "@/app/actions/coaching";
import { todayIso } from "@/lib/format/dates";
import { cn } from "@/lib/utils";
import type { CoachingSessionType } from "@/lib/types/database";

const SESSION_TYPES: { value: CoachingSessionType; label: string }[] = [
  { value: "discussion", label: "Discussion" },
  { value: "verbal_warning", label: "Verbal warning" },
  { value: "write_up", label: "Write up" },
  { value: "final_warning", label: "Final warning" },
  { value: "termination", label: "Termination" },
];

type CreateProps = {
  mode?: "create";
  driverId: string;
  driverName: string;
};

type EditProps = {
  mode: "edit";
  driverId: string;
  driverName: string;
  session: {
    id: string;
    session_date: string;
    session_type: CoachingSessionType;
    topic: string;
    notes: string | null;
    acknowledged: boolean;
  };
};

type Props = CreateProps | EditProps;

export function LogSessionDialog(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Initial values: edit-mode pre-fills from the session; create-mode uses defaults.
  const initial = isEdit
    ? {
        sessionDate: props.session.session_date,
        sessionType: props.session.session_type,
        topic: props.session.topic,
        notes: props.session.notes ?? "",
        acknowledged: props.session.acknowledged,
      }
    : {
        sessionDate: todayIso(),
        sessionType: "discussion" as CoachingSessionType,
        topic: "",
        notes: "",
        acknowledged: false,
      };

  const [sessionDate, setSessionDate] = useState(initial.sessionDate);
  const [sessionType, setSessionType] = useState<CoachingSessionType>(
    initial.sessionType,
  );
  const [topic, setTopic] = useState(initial.topic);
  const [notes, setNotes] = useState(initial.notes);
  const [acknowledged, setAcknowledged] = useState(initial.acknowledged);

  function reset() {
    setSessionDate(initial.sessionDate);
    setSessionType(initial.sessionType);
    setTopic(initial.topic);
    setNotes(initial.notes);
    setAcknowledged(initial.acknowledged);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      toast.error("Topic is required.");
      return;
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateCoachingSession({
            session_id: props.session.id,
            driver_id: props.driverId,
            session_date: sessionDate,
            session_type: sessionType,
            topic: topic.trim(),
            notes: notes.trim() || null,
          })
        : await createCoachingSession({
            driver_id: props.driverId,
            session_date: sessionDate,
            session_type: sessionType,
            topic: topic.trim(),
            notes: notes.trim() || null,
            acknowledged,
          });

      if (!res.ok) {
        toast.error(res.error || "Could not save.");
        return;
      }

      toast.success(isEdit ? "Session updated." : "Session logged.");
      if (!isEdit) reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        className={cn(
          isEdit
            ? "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            : "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90",
        )}
      >
        {isEdit ? (
          <>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </>
        ) : (
          <>
            <MessageSquarePlus className="h-4 w-4" />
            Log new session
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit coaching session" : "Log coaching session"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `For ${props.driverName}. Edits are admin-only and create an audit revision.`
              : `For ${props.driverName}. Sessions are immutable once saved — admin-only edits create an audit revision.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session_date">Date</Label>
              <Input
                id="session_date"
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session_type">Type</Label>
              <select
                id="session_type"
                value={sessionType}
                onChange={(e) =>
                  setSessionType(e.target.value as CoachingSessionType)
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              required
              maxLength={200}
              placeholder="e.g. Hard braking on 7-Eleven route"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={5}
              maxLength={10_000}
              placeholder="What was discussed? What did the driver agree to?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {!isEdit && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(Boolean(v))}
                className="mt-0.5"
              />
              <div>
                <div>Driver acknowledged</div>
                <div className="text-xs text-muted-foreground">
                  Check if the driver confirmed understanding during the
                  session. Can be flipped later from the session card.
                </div>
              </div>
            </label>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : isEdit
                  ? "Save changes"
                  : "Save session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

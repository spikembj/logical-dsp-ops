"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
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
import { createCoachingSession } from "@/app/actions/coaching";
import { todayIso } from "@/lib/format/dates";

interface Props {
  driverId: string;
  driverName: string;
}

export function LogSessionDialog({ driverId, driverName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [sessionDate, setSessionDate] = useState(todayIso());
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  function reset() {
    setSessionDate(todayIso());
    setTopic("");
    setNotes("");
    setAcknowledged(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      toast.error("Topic is required.");
      return;
    }
    startTransition(async () => {
      const res = await createCoachingSession({
        driver_id: driverId,
        session_date: sessionDate,
        topic: topic.trim(),
        notes: notes.trim() || null,
        acknowledged,
      });
      if (!res.ok) {
        toast.error(res.error || "Could not log session.");
        return;
      }
      toast.success("Session logged.");
      reset();
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
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Log new session
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log coaching session</DialogTitle>
          <DialogDescription>
            For {driverName}. Sessions are immutable once saved — edits create
            an audit revision.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              {pending ? "Saving..." : "Save session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

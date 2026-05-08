"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { voidCoachingSession } from "@/app/actions/coaching";

export function VoidSessionDialog({
  sessionId,
  driverId,
  topic,
}: {
  sessionId: string;
  driverId: string;
  topic: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }

    startTransition(async () => {
      const res = await voidCoachingSession({
        session_id: sessionId,
        driver_id: driverId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        toast.error(res.error || "Could not void session.");
        return;
      }
      toast.success("Session voided.");
      setReason("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setReason("");
      }}
    >
      <DialogTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
        Void
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void coaching session</DialogTitle>
          <DialogDescription>
            “{topic}” will be hidden from normal views and won&rsquo;t count
            toward coaching coverage. The original record is preserved.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="void_reason">Reason</Label>
            <Textarea
              id="void_reason"
              rows={3}
              maxLength={500}
              required
              placeholder="e.g. Wrong driver attributed; data was incorrect."
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required. Future viewers will see this reason next to the
              voided record.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding..." : "Void session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

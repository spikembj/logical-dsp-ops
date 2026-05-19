"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plus, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  upsertCandidate,
  lookupPriorDeclinesAction,
} from "@/app/actions/hr-candidates";
import {
  normalizePhoneClient,
  type CandidateListItem,
  type CandidateStatusRow,
} from "@/lib/queries/hr-candidates-types";

/**
 * Add or edit a candidate. Trigger is either:
 *   - "Add candidate" button (when no `candidate` prop)
 *   - inline Edit icon on the candidate card (when `candidate` is set)
 *
 * Live dedup: as the user types into the phone field, we debounce a
 * server lookup against prior declined candidates with the same
 * 10-digit phone. If any matches come back, a yellow warning banner
 * appears INSIDE the dialog before save. The warning does not block
 * save — HR may legitimately re-interview someone they declined before.
 *
 * The status dropdown defaults to whatever the parent passed in
 * (`defaultStatusId`) so "Add to this section" buttons can pre-pick
 * the right bucket. For Edit, the candidate's current status is the
 * default.
 */
interface Props {
  trigger?: React.ReactNode;
  statuses: CandidateStatusRow[];
  /** When set, the dialog opens in Edit mode for this candidate. */
  candidate?: CandidateListItem;
  /** When set + no candidate, the form starts with this status picked. */
  defaultStatusId?: string;
}

export function CandidateFormDialog({
  trigger,
  statuses,
  candidate,
  defaultStatusId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = !!candidate;

  // The Add button is the default trigger if the parent did not pass one.
  const defaultTrigger = (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
    >
      <Plus className="h-4 w-4" />
      Add candidate
    </button>
  );

  const [fullName, setFullName] = useState(candidate?.full_name ?? "");
  const [phone, setPhone] = useState(candidate?.phone_display ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [interviewDt, setInterviewDt] = useState(
    candidate?.interview_dt
      ? format(parseISO(candidate.interview_dt), "yyyy-MM-dd'T'HH:mm")
      : "",
  );
  const [interviewDsp, setInterviewDsp] = useState(
    candidate?.interview_dsp ?? "",
  );
  const [source, setSource] = useState(candidate?.source ?? "");
  const [notes, setNotes] = useState(candidate?.notes ?? "");
  const [statusId, setStatusId] = useState(
    candidate?.status_id ??
      defaultStatusId ??
      statuses[0]?.id ??
      "",
  );

  // Live dedup matches for the typed phone, refreshed via debounce.
  type Match = {
    id: string;
    full_name: string;
    created_at: string;
    status_name: string;
  };
  const [dedupMatches, setDedupMatches] = useState<Match[]>([]);
  const dedupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dedupTimer.current) clearTimeout(dedupTimer.current);
    const digits = normalizePhoneClient(phone);
    if (!digits || digits.length < 10) {
      setDedupMatches([]);
      return;
    }
    dedupTimer.current = setTimeout(async () => {
      const res = await lookupPriorDeclinesAction(phone);
      if (res.ok) {
        // When editing, exclude the candidate's own record from the
        // matches — re-typing a declined candidate's own phone should
        // not warn against themselves.
        const filtered = res.data?.matches.filter((m) => m.id !== candidate?.id) ?? [];
        setDedupMatches(filtered);
      }
    }, 350);
    return () => {
      if (dedupTimer.current) clearTimeout(dedupTimer.current);
    };
  }, [phone, candidate?.id]);

  function reset() {
    if (isEdit && candidate) {
      setFullName(candidate.full_name);
      setPhone(candidate.phone_display ?? "");
      setEmail(candidate.email ?? "");
      setInterviewDt(
        candidate.interview_dt
          ? format(parseISO(candidate.interview_dt), "yyyy-MM-dd'T'HH:mm")
          : "",
      );
      setInterviewDsp(candidate.interview_dsp ?? "");
      setSource(candidate.source ?? "");
      setNotes(candidate.notes ?? "");
      setStatusId(candidate.status_id);
    } else {
      setFullName("");
      setPhone("");
      setEmail("");
      setInterviewDt("");
      setInterviewDsp("");
      setSource("");
      setNotes("");
      setStatusId(defaultStatusId ?? statuses[0]?.id ?? "");
    }
    setDedupMatches([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!statusId) {
      toast.error("Pick a status.");
      return;
    }
    startTransition(async () => {
      const res = await upsertCandidate({
        id: candidate?.id,
        status_id: statusId,
        full_name: fullName.trim(),
        phone_display: phone.trim() || null,
        email: email.trim() || null,
        // datetime-local sends "YYYY-MM-DDTHH:MM" with no timezone. We
        // append :00 seconds so Postgres accepts it as a timestamp; the
        // column is timestamptz which will interpret as the server's TZ.
        // Fine for our use case — interviews are local-only.
        interview_dt: interviewDt ? `${interviewDt}:00` : null,
        interview_dsp: interviewDsp.trim() || null,
        source: source.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Saved." : "Candidate added.");
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
      <DialogTrigger>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit candidate" : "Add candidate"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cand-name">Name</Label>
            <Input
              id="cand-name"
              value={fullName}
              onChange={(e) => setFullName(e.currentTarget.value)}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cand-phone">Phone</Label>
              <Input
                id="cand-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                placeholder="(801) 555-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-status">Status</Label>
              <select
                id="cand-status"
                value={statusId}
                onChange={(e) => setStatusId(e.currentTarget.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dedupMatches.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 p-2.5 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-amber-900 dark:text-amber-200">
                    Previously declined — same phone number
                  </div>
                  <ul className="mt-1 space-y-0.5 text-amber-900/80 dark:text-amber-200/80">
                    {dedupMatches.map((m) => (
                      <li key={m.id}>
                        {m.full_name} — {m.status_name} on{" "}
                        {format(parseISO(m.created_at), "MMM d, yyyy")}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-amber-700 dark:text-amber-300/80">
                    You can still save — this is just a heads-up.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cand-interview">Interview date / time</Label>
            <Input
              id="cand-interview"
              type="datetime-local"
              value={interviewDt}
              onChange={(e) => setInterviewDt(e.currentTarget.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cand-dsp">DSP</Label>
              <Input
                id="cand-dsp"
                value={interviewDsp}
                onChange={(e) => setInterviewDsp(e.currentTarget.value)}
                placeholder="DUT4 / DUT7"
                list="dsp-options"
              />
              <datalist id="dsp-options">
                <option value="DUT4" />
                <option value="DUT7" />
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-source">Source</Label>
              <Input
                id="cand-source"
                value={source}
                onChange={(e) => setSource(e.currentTarget.value)}
                placeholder="referral, walk-in…"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cand-email">Email (optional)</Label>
            <Input
              id="cand-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cand-notes">Notes</Label>
            <textarea
              id="cand-notes"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Anything useful for the next person to read this card…"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

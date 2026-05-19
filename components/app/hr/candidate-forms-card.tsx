"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSignature,
  Link as LinkIcon,
  QrCode,
  RefreshCcw,
  Trash2,
  CheckCircle2,
  Eye,
  Copy,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ensureInvitation,
  regenerateInvitationToken,
  deleteInvitation,
} from "@/app/actions/hr-candidate-forms";
import type { CandidateFormStatusRow } from "@/lib/queries/hr-candidate-forms-types";
import { cn } from "@/lib/utils";

/**
 * Per-candidate forms card on /hr/candidates/[id]. One row per active
 * form (interviewee + onboarding seeded, HR can add more). Status:
 *   - not generated → Generate link button creates an invitation +
 *     surfaces a QR + copy-link affordance
 *   - sent (no submit) → Show link / QR · Regenerate · Delete
 *   - submitted → Submitted [date] · View answers · Show link · Regen · Del
 *
 * The QR/link modal renders the QR with the `qrcode` package (same lib
 * the fleet VIN sheet uses) and includes a Copy-link button.
 */
export function CandidateFormsCard({
  candidateId,
  candidateName,
  rows,
  publicOrigin,
}: {
  candidateId: string;
  candidateName: string;
  rows: CandidateFormStatusRow[];
  /** Origin like "https://logical-ops.vercel.app" — used to build the
   *  full URL for the QR. We pass it from the server so the QR shows
   *  even when the user is on localhost. */
  publicOrigin: string;
}) {
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <FileSignature className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Candidate forms</h2>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          No active forms. Add one on the{" "}
          <a className="underline" href="/hr/candidates/forms">
            Forms admin
          </a>
          .
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <FormRow
              key={r.form.id}
              candidateId={candidateId}
              candidateName={candidateName}
              row={r}
              publicOrigin={publicOrigin}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FormRow({
  candidateId,
  candidateName,
  row,
  publicOrigin,
}: {
  candidateId: string;
  candidateName: string;
  row: CandidateFormStatusRow;
  publicOrigin: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(
    row.invitation?.token ?? null,
  );

  function openQr() {
    if (row.invitation) {
      setQrToken(row.invitation.token);
      setQrOpen(true);
      return;
    }
    startTransition(async () => {
      const res = await ensureInvitation({
        candidate_id: candidateId,
        form_id: row.form.id,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setQrToken(res.data?.token ?? null);
      setQrOpen(true);
      router.refresh();
    });
  }

  function regenerate() {
    if (!row.invitation) return;
    if (
      !confirm(
        "Rotate the token? The previous URL stops working immediately. The candidate will need the new link.",
      )
    )
      return;
    startTransition(async () => {
      const res = await regenerateInvitationToken({
        invitation_id: row.invitation!.id,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setQrToken(res.data?.token ?? null);
      toast.success("New link generated.");
      router.refresh();
    });
  }

  function remove() {
    if (!row.invitation) return;
    if (
      !confirm(
        "Delete this invitation? The URL stops working. Any submitted answers are lost.",
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteInvitation({
        invitation_id: row.invitation!.id,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  const submitted = !!row.invitation?.submitted_at;

  return (
    <li className="px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{row.form.name}</span>
          {submitted ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              submitted
            </span>
          ) : row.invitation ? (
            <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              link generated
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
              not generated
            </span>
          )}
        </div>
        {row.form.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {row.form.description}
          </p>
        )}
        <div className="text-[11px] text-muted-foreground">
          {row.question_count} question{row.question_count === 1 ? "" : "s"}
          {row.invitation && (
            <>
              {" · "}created{" "}
              {format(parseISO(row.invitation.created_at), "MMM d, yyyy")}
            </>
          )}
          {submitted && row.invitation?.submitted_at && (
            <>
              {" · "}submitted{" "}
              {format(parseISO(row.invitation.submitted_at), "MMM d, yyyy")} ·{" "}
              {row.answer_count} answer{row.answer_count === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      <div className="inline-flex items-center gap-1">
        {submitted && (
          <a
            href={`/hr/candidates/${candidateId}/forms/${row.form.slug}`}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border bg-background text-xs font-medium hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            View answers
          </a>
        )}
        <button
          type="button"
          onClick={openQr}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
            row.invitation
              ? "border bg-background hover:bg-muted text-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
          )}
        >
          {row.invitation ? <LinkIcon className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
          {row.invitation ? "Show link / QR" : "Generate link"}
        </button>
        {row.invitation && (
          <>
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              aria-label="Rotate token"
              title="Generate a fresh token — old URL stops working."
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="Delete invitation"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <QrModal
        open={qrOpen}
        onOpenChange={setQrOpen}
        token={qrToken}
        formName={row.form.name}
        candidateName={candidateName}
        publicOrigin={publicOrigin}
      />
    </li>
  );
}

function QrModal({
  open,
  onOpenChange,
  token,
  formName,
  candidateName,
  publicOrigin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string | null;
  formName: string;
  candidateName: string;
  publicOrigin: string;
}) {
  // Lazy-load qrcode on the client so we do not ship it on every page.
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const url = token ? `${publicOrigin}/forms/${token}` : "";

  function copy() {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Could not copy."),
    );
  }

  // Generate the QR svg whenever the modal opens with a fresh token.
  // Lazy-load `qrcode` so it ships only on this page.
  useEffect(() => {
    let cancelled = false;
    if (open && url) {
      setQrSvg(null); // reset while regenerating
      import("qrcode").then((m) => {
        m.toString(url, { type: "svg", width: 256, margin: 1 }).then((svg) => {
          if (!cancelled) setQrSvg(svg);
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {formName} — {candidateName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {qrSvg ? (
            <div
              className="mx-auto w-64 h-64 [&>svg]:w-full [&>svg]:h-full bg-white p-2 rounded"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="mx-auto w-64 h-64 grid place-items-center bg-muted rounded text-xs text-muted-foreground">
              Generating…
            </div>
          )}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Link
            </div>
            <div className="flex items-center gap-1">
              <input
                value={url}
                readOnly
                className="flex-1 h-8 rounded-md border bg-background px-2 text-xs font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anyone with this link can submit the form. Rotate the token
            (the circular-arrows button on the row) if it leaks.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

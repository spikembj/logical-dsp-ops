"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveInterviewResponse,
  dispatcherChangeCandidateStatus,
} from "@/app/actions/hr-interviews";
import type {
  InterviewQuestion,
  InterviewResponseFull,
} from "@/lib/queries/hr-interviews-types";
import type { CandidateStatusRow } from "@/lib/queries/hr-candidates-types";

/**
 * The dispatcher's interview form. Y/N questions render as a
 * three-state chip (Yes / No / —); text questions as a textarea.
 * Status dropdown is at the top — changing it fires the narrow
 * dispatcher-only RPC so dispatchers can move the candidate between
 * buckets without RLS-level write access to other columns.
 *
 * Save commits the response (one row per candidate, upserted) plus
 * the answers (delete + re-insert). Edit-in-place — there is no
 * history of past responses.
 */
type YnValue = "yes" | "no" | "skip";

export function DispatcherInterviewForm({
  candidateId,
  questions,
  existing,
  statuses,
  currentStatusId,
  conductedByOptions,
  currentUserId,
}: {
  candidateId: string;
  questions: InterviewQuestion[];
  existing: InterviewResponseFull | null;
  statuses: CandidateStatusRow[];
  currentStatusId: string;
  conductedByOptions: { id: string; label: string }[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Seed local state from the existing response (if any).
  const existingAnswers = new Map(
    (existing?.answers ?? []).map((a) => [a.question_id, a]),
  );
  const [conductedBy, setConductedBy] = useState<string>(
    existing?.conducted_by ?? currentUserId ?? "",
  );
  const [overallNotes, setOverallNotes] = useState(
    existing?.overall_notes ?? "",
  );
  const [ynAnswers, setYnAnswers] = useState<Record<string, YnValue>>(() => {
    const m: Record<string, YnValue> = {};
    for (const q of questions) {
      if (q.response_type !== "yn") continue;
      const a = existingAnswers.get(q.id);
      m[q.id] =
        a?.value_bool === true
          ? "yes"
          : a?.value_bool === false
            ? "no"
            : "skip";
    }
    return m;
  });
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const q of questions) {
      if (q.response_type !== "text") continue;
      const a = existingAnswers.get(q.id);
      m[q.id] = a?.value_text ?? "";
    }
    return m;
  });
  const [statusId, setStatusId] = useState(currentStatusId);

  function handleStatusChange(next: string) {
    if (next === statusId) return;
    setStatusId(next); // optimistic
    startTransition(async () => {
      const res = await dispatcherChangeCandidateStatus({
        candidate_id: candidateId,
        status_id: next,
      });
      if (!res.ok) {
        toast.error(res.error);
        setStatusId(currentStatusId); // roll back
        return;
      }
      toast.success("Status updated.");
      router.refresh();
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const answers = questions
      .map((q) => {
        if (q.response_type === "yn") {
          const v = ynAnswers[q.id];
          if (!v || v === "skip") return null;
          return {
            question_id: q.id,
            value_bool: v === "yes",
            value_text: null,
          };
        }
        const v = (textAnswers[q.id] ?? "").trim();
        if (!v) return null;
        return {
          question_id: q.id,
          value_bool: null,
          value_text: v,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    startTransition(async () => {
      const res = await saveInterviewResponse({
        candidate_id: candidateId,
        conducted_by: conductedBy || null,
        overall_notes: overallNotes.trim() || null,
        answers,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  const ynQuestions = questions.filter((q) => q.response_type === "yn");
  const textQuestions = questions.filter((q) => q.response_type === "text");

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Status
            </div>
            <select
              value={statusId}
              onChange={(e) => handleStatusChange(e.currentTarget.value)}
              disabled={pending}
              className="mt-1 h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Conducted by
            </div>
            <select
              value={conductedBy}
              onChange={(e) => setConductedBy(e.currentTarget.value)}
              disabled={pending}
              className="mt-1 h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— not set —</option>
              {conductedByOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {ynQuestions.length > 0 && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Yes / No</h2>
          </header>
          <ul className="divide-y">
            {ynQuestions.map((q) => (
              <li
                key={q.id}
                className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
              >
                <span className="text-sm flex-1 min-w-0">{q.prompt}</span>
                <YnPicker
                  value={ynAnswers[q.id] ?? "skip"}
                  onChange={(v) =>
                    setYnAnswers((m) => ({ ...m, [q.id]: v }))
                  }
                  disabled={pending}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {textQuestions.length > 0 && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Notes</h2>
          </header>
          <ul className="divide-y">
            {textQuestions.map((q) => (
              <li key={q.id} className="px-4 py-3 space-y-1.5">
                <label className="text-sm font-medium block" htmlFor={`q-${q.id}`}>
                  {q.prompt}
                </label>
                <textarea
                  id={`q-${q.id}`}
                  value={textAnswers[q.id] ?? ""}
                  onChange={(e) =>
                    setTextAnswers((m) => ({
                      ...m,
                      [q.id]: e.currentTarget.value,
                    }))
                  }
                  disabled={pending}
                  rows={2}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 space-y-2">
        <label className="text-sm font-semibold block" htmlFor="overall-notes">
          Overall notes
        </label>
        <textarea
          id="overall-notes"
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.currentTarget.value)}
          disabled={pending}
          rows={4}
          placeholder="Anything HR should know before deciding…"
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </section>

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving..." : existing ? "Save changes" : "Save assessment"}
        </button>
      </div>
    </form>
  );
}

/** 3-state Yes / No / — chip group. "skip" means "did not answer". */
function YnPicker({
  value,
  onChange,
  disabled,
}: {
  value: YnValue;
  onChange: (v: YnValue) => void;
  disabled?: boolean;
}) {
  const options: { v: YnValue; label: string; icon: React.ComponentType<{ className?: string }>; on: string }[] = [
    {
      v: "yes",
      label: "Yes",
      icon: Check,
      on: "bg-emerald-600 text-white border-emerald-600",
    },
    {
      v: "no",
      label: "No",
      icon: X,
      on: "bg-red-600 text-white border-red-600",
    },
    {
      v: "skip",
      label: "—",
      icon: Minus,
      on: "bg-muted text-foreground border-foreground/30",
    },
  ];
  return (
    <div className="inline-flex rounded-md border overflow-hidden text-xs shrink-0">
      {options.map((o) => {
        const active = value === o.v;
        const Icon = o.icon;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1.5 transition-colors disabled:opacity-50",
              active
                ? o.on
                : "bg-background hover:bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

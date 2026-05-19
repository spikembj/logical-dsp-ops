"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Check, X, Minus, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitPublicForm } from "@/app/actions/hr-candidate-forms";
import type {
  CandidateFormAnswer,
  CandidateFormQuestion,
} from "@/lib/queries/hr-candidate-forms-types";

/**
 * The candidate-facing form. Lives at `/forms/[token]`. No auth — the
 * token in the URL is the credential. Y/N questions render as a
 * three-state chip (Yes / No / —), text questions as a textarea.
 *
 * Edit-in-place: if the candidate already submitted, the form
 * pre-fills with their previous answers and a green banner indicates
 * the form is already on file. They can still update.
 */
type YnValue = "yes" | "no" | "skip";

export function IntervieweeForm({
  token,
  formName,
  candidateName,
  questions,
  existingAnswers,
  alreadySubmitted,
}: {
  token: string;
  formName: string;
  candidateName: string;
  questions: CandidateFormQuestion[];
  existingAnswers: CandidateFormAnswer[];
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedOnce, setSavedOnce] = useState(false);

  const existingByQ = new Map(existingAnswers.map((a) => [a.question_id, a]));

  const [ynAnswers, setYnAnswers] = useState<Record<string, YnValue>>(() => {
    const m: Record<string, YnValue> = {};
    for (const q of questions) {
      if (q.response_type !== "yn") continue;
      const a = existingByQ.get(q.id);
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
      const a = existingByQ.get(q.id);
      m[q.id] = a?.value_text ?? "";
    }
    return m;
  });

  function handleSubmit(e: React.FormEvent) {
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
      const res = await submitPublicForm({
        token,
        answers,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Thanks! Your answers were saved.");
      setSavedOnce(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{formName}</h1>
        <p className="text-sm text-muted-foreground">
          For <strong>{candidateName}</strong>. Answer the ones you can —
          you can come back and edit later using the same link.
        </p>
      </header>

      {(alreadySubmitted || savedOnce) && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-3 py-2 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>
            {savedOnce
              ? "Saved. You can keep editing if you need to."
              : "We already have your answers on file. You can update them below if anything changed."}
          </span>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No questions configured yet. Tell whoever sent you this link.
        </div>
      ) : (
        <ul className="space-y-3">
          {questions.map((q) =>
            q.response_type === "yn" ? (
              <li key={q.id} className="rounded-xl border bg-card px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                <span className="text-sm flex-1 min-w-0">{q.prompt}</span>
                <YnPicker
                  value={ynAnswers[q.id] ?? "skip"}
                  onChange={(v) => setYnAnswers((m) => ({ ...m, [q.id]: v }))}
                  disabled={pending}
                />
              </li>
            ) : (
              <li key={q.id} className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
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
            ),
          )}
        </ul>
      )}

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="submit"
          disabled={pending || questions.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
          {pending
            ? "Saving..."
            : alreadySubmitted || savedOnce
              ? "Save changes"
              : "Submit"}
        </button>
      </div>
    </form>
  );
}

function YnPicker({
  value,
  onChange,
  disabled,
}: {
  value: YnValue;
  onChange: (v: YnValue) => void;
  disabled?: boolean;
}) {
  const options: {
    v: YnValue;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    on: string;
  }[] = [
    { v: "yes", label: "Yes", icon: Check, on: "bg-emerald-600 text-white border-emerald-600" },
    { v: "no", label: "No", icon: X, on: "bg-red-600 text-white border-red-600" },
    { v: "skip", label: "—", icon: Minus, on: "bg-muted text-foreground border-foreground/30" },
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

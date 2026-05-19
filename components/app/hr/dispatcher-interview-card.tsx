import Link from "next/link";
import { Check, X, Minus, MessageSquare, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { InterviewResponseFull } from "@/lib/queries/hr-interviews-types";

/**
 * Read-only display of the dispatcher's interview response on the HR
 * candidate detail page. Renders Y/N answers as colored chips, text
 * answers as quoted blocks, and shows the overall notes + who/when at
 * the top.
 *
 * Two states:
 *   - existing: show the response
 *   - missing: show a small "no assessment yet" placeholder with a
 *     link to /daily/interviews/[id] so management can fill it in
 *     themselves if needed.
 */
export function DispatcherInterviewCard({
  candidateId,
  response,
}: {
  candidateId: string;
  response: InterviewResponseFull | null;
}) {
  if (!response) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-2">Dispatcher interview</h2>
        <p className="text-sm text-muted-foreground">
          No assessment recorded yet.{" "}
          <Link
            href={`/daily/interviews/${candidateId}`}
            className="underline hover:text-foreground"
          >
            Fill one in →
          </Link>
        </p>
      </section>
    );
  }

  const ynAnswers = response.answers.filter(
    (a) => a.question.response_type === "yn",
  );
  const textAnswers = response.answers.filter(
    (a) => a.question.response_type === "text",
  );

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Dispatcher interview</h2>
          <Link
            href={`/daily/interviews/${candidateId}`}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
          >
            Edit
          </Link>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(parseISO(response.conducted_at), "MMM d, yyyy")}
          </span>
          {response.conducted_by_name && (
            <span>by {response.conducted_by_name}</span>
          )}
        </div>
      </header>

      {ynAnswers.length > 0 && (
        <ul className="divide-y">
          {ynAnswers.map((a) => (
            <li
              key={a.id}
              className="px-4 py-2 flex items-center gap-3 justify-between"
            >
              <span className="text-sm flex-1 min-w-0">{a.question.prompt}</span>
              <YnDisplay value={a.value_bool} />
            </li>
          ))}
        </ul>
      )}

      {textAnswers.length > 0 && (
        <ul className="divide-y border-t">
          {textAnswers.map((a) => (
            <li key={a.id} className="px-4 py-2 space-y-0.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {a.question.prompt}
              </div>
              <p className="text-sm whitespace-pre-wrap">{a.value_text}</p>
            </li>
          ))}
        </ul>
      )}

      {response.overall_notes && (
        <div className="px-4 py-3 border-t bg-muted/20">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Overall notes
          </div>
          <p className="text-sm whitespace-pre-wrap">{response.overall_notes}</p>
        </div>
      )}
    </section>
  );
}

function YnDisplay({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <Check className="h-3 w-3" />
        Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
        <X className="h-3 w-3" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
      <Minus className="h-3 w-3" />
      —
    </span>
  );
}


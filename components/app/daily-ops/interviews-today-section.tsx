import Link from "next/link";
import { Calendar, ChevronRight, CheckCircle2, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/queries/hr-candidates-types";
import type { TodaysInterviewRow } from "@/lib/queries/hr-interviews-types";

/**
 * Server-rendered section on `/daily` listing the day's scheduled
 * interviews. One row per candidate with an interview in the window;
 * "Has assessment" tick appears once a dispatcher has filled in the
 * form. Click "Open interview" → `/daily/interviews/[candidate_id]`.
 *
 * Hidden entirely when there are no interviews — keeps the morning
 * roster view uncluttered on days without hiring activity.
 */
export function InterviewsTodaySection({
  rows,
}: {
  rows: TodaysInterviewRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card">
      <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Interviews today</h2>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {rows.length} scheduled · {rows.filter((r) => r.has_response).length} done
        </span>
      </header>
      <ul className="divide-y">
        {rows.map((r) => (
          <li
            key={r.id}
            className="px-4 py-2.5 flex flex-wrap items-center gap-3"
          >
            <span className="inline-flex items-center justify-center min-w-[4.5rem] h-7 px-2 rounded-full text-xs font-semibold bg-primary/10 text-primary tabular-nums">
              {format(parseISO(r.interview_dt), "h:mma").replace(":00", "").toLowerCase()}
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">
                  {r.full_name}
                </span>
                {r.interview_dsp && (
                  <span className="text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">
                    {r.interview_dsp}
                  </span>
                )}
                {r.has_response && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                    title="A dispatcher has filled out the assessment for this candidate."
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    assessed
                  </span>
                )}
              </div>
              {r.phone_display && (
                <a
                  href={`tel:${r.phone_digits ?? r.phone_display}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3 w-3" />
                  {formatPhone(r.phone_digits) || r.phone_display}
                </a>
              )}
            </div>
            <Link
              href={`/daily/interviews/${r.id}`}
              className={cn(
                "inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium transition-colors",
                r.has_response
                  ? "border bg-background hover:bg-muted text-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
              )}
            >
              {r.has_response ? "Review" : "Open interview"}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

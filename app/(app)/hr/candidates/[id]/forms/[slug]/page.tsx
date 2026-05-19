import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Check, X, Minus, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireManagement } from "@/lib/auth/require-role";
import { getCandidateById } from "@/lib/queries/hr-candidates";
import {
  getCandidateFormBySlug,
  listFormQuestions,
  getInvitationAnswers,
} from "@/lib/queries/hr-candidate-forms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string; slug: string }>;
}

/**
 * HR-side read-only view of a candidate's submitted form answers.
 * Reached via the "View answers" button on the Candidate forms card.
 *
 * Pulls every question on the form (so unanswered questions show as
 * "—" rather than silently disappearing) and merges in the candidate's
 * answers.
 */
export default async function CandidateFormAnswersPage({ params }: PageProps) {
  await requireManagement();
  const { id, slug } = await params;
  const [candidate, form] = await Promise.all([
    getCandidateById(id),
    getCandidateFormBySlug(slug),
  ]);
  if (!candidate || !form) notFound();

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("candidate_form_invitations")
    .select("id, submitted_at, sent_at")
    .eq("candidate_id", id)
    .eq("form_id", form.id)
    .maybeSingle();

  const invitation = inv as {
    id: string;
    submitted_at: string | null;
    sent_at: string;
  } | null;
  if (!invitation) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Header candidateId={id} candidateName={candidate.full_name} formName={form.name} />
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No link generated yet for this candidate.
        </div>
      </div>
    );
  }

  const [questions, answers] = await Promise.all([
    listFormQuestions(form.id),
    getInvitationAnswers(invitation.id),
  ]);

  const answerByQ = new Map(answers.map((a) => [a.question_id, a]));

  return (
    <div className="space-y-4 max-w-3xl">
      <Header
        candidateId={id}
        candidateName={candidate.full_name}
        formName={form.name}
      />

      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          Link sent {format(parseISO(invitation.sent_at), "MMM d, yyyy")}
        </span>
        {invitation.submitted_at ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Submitted {format(parseISO(invitation.submitted_at), "MMM d, yyyy")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            Not submitted yet
          </span>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          This form has no questions.
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y overflow-hidden">
          {questions.map((q) => {
            const a = answerByQ.get(q.id);
            return (
              <li
                key={q.id}
                className={cn(
                  "px-4 py-3",
                  !q.active && "opacity-60",
                  q.response_type === "yn"
                    ? "flex items-center gap-3 justify-between"
                    : "space-y-1",
                )}
              >
                {q.response_type === "yn" ? (
                  <>
                    <span className="text-sm flex-1 min-w-0">
                      {q.prompt}
                      {!q.active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          inactive
                        </span>
                      )}
                    </span>
                    <YnDisplay value={a?.value_bool ?? null} />
                  </>
                ) : (
                  <>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {q.prompt}
                    </div>
                    {a?.value_text ? (
                      <p className="text-sm whitespace-pre-wrap">{a.value_text}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        — no answer —
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Header({
  candidateId,
  candidateName,
  formName,
}: {
  candidateId: string;
  candidateName: string;
  formName: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{formName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Answers from <strong>{candidateName}</strong>.
        </p>
      </div>
      <Link
        href={`/hr/candidates/${candidateId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to candidate
      </Link>
    </div>
  );
}

function YnDisplay({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 shrink-0">
        <Check className="h-3 w-3" />
        Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 shrink-0">
        <X className="h-3 w-3" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium bg-muted text-muted-foreground shrink-0">
      <Minus className="h-3 w-3" />
      —
    </span>
  );
}

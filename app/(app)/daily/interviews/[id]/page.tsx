import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Phone, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  getInterviewResponseFor,
  listInterviewQuestions,
} from "@/lib/queries/hr-interviews";
import {
  listCandidateStatuses,
  formatPhone,
  CANDIDATE_STATUS_CHIP_CLASSES,
  type CandidateRow,
  type CandidateStatusColor,
} from "@/lib/queries/hr-candidates";
import { listUsers } from "@/lib/queries/users";
import { DispatcherInterviewForm } from "@/components/app/daily-ops/dispatcher-interview-form";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Dispatcher interview form page. Reached from the
 * "Today's interviews" section on `/daily` (and from a quick-link on
 * the HR candidate detail page for management).
 *
 * Dispatcher RLS only lets them read candidates with interview_dt in
 * the ±7-day window; if the row is outside that window or the ID is
 * bogus, the candidate read fails and we 404. Management always sees
 * the row.
 */
export default async function DispatcherInterviewPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  // Read just the candidate fields the dispatcher needs — name, phone,
  // interview time, status. RLS handles the access gate.
  const { data, error } = await supabase
    .from("candidates")
    .select(
      "id, full_name, phone_display, phone_digits, interview_dt, interview_dsp, status_id, archived_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();
  const candidate = data as Pick<
    CandidateRow,
    | "id"
    | "full_name"
    | "phone_display"
    | "phone_digits"
    | "interview_dt"
    | "interview_dsp"
    | "status_id"
    | "archived_at"
  >;
  if (candidate.archived_at) notFound();

  const [questions, existing, statuses, users] = await Promise.all([
    listInterviewQuestions(true),
    getInterviewResponseFor(id),
    listCandidateStatuses(),
    listUsers(),
  ]);

  const status = statuses.find((s) => s.id === candidate.status_id);
  // Conducted-by picker: anyone with an operations role. Inactive users
  // dropped so the list does not balloon over time.
  const conductedByOptions = users
    .filter(
      (u) =>
        u.active &&
        [
          "owner",
          "hr",
          "ops_manager",
          "dispatcher",
          "admin",
          "manager",
        ].includes(u.role),
    )
    .map((u) => ({
      id: u.id,
      label: u.full_name ?? u.email,
    }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/daily"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Daily Ops
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {candidate.full_name}
            </h1>
            {status && (
              <span
                className={cn(
                  "inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-wider",
                  CANDIDATE_STATUS_CHIP_CLASSES[status.color as CandidateStatusColor],
                )}
              >
                {status.name}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
            {candidate.interview_dt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(parseISO(candidate.interview_dt), "EEE MMM d, h:mma").replace(":00", "")}
              </span>
            )}
            {candidate.phone_display && (
              <a
                href={`tel:${candidate.phone_digits ?? candidate.phone_display}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5" />
                {formatPhone(candidate.phone_digits) || candidate.phone_display}
              </a>
            )}
            {candidate.interview_dsp && (
              <span className="inline-flex items-center text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">
                {candidate.interview_dsp}
              </span>
            )}
          </div>
        </div>
      </div>

      <DispatcherInterviewForm
        candidateId={candidate.id}
        questions={questions}
        existing={existing}
        statuses={statuses.filter((s) => s.active)}
        currentStatusId={candidate.status_id}
        conductedByOptions={conductedByOptions}
        currentUserId={me.id ?? null}
      />
    </div>
  );
}

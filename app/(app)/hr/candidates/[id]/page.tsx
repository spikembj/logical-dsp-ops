import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Phone, Mail, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireManagement } from "@/lib/auth/require-role";
import {
  getCandidateById,
  getOnboardingChecklistFor,
  listCandidateStatuses,
  formatPhone,
  CANDIDATE_STATUS_CHIP_CLASSES,
} from "@/lib/queries/hr-candidates";
import { CandidateFormDialog } from "@/components/app/hr/candidate-form-dialog";
import { CandidateOnboardingChecklist } from "@/components/app/hr/candidate-onboarding-checklist";
import { ConvertToDriverDialog } from "@/components/app/hr/convert-to-driver-dialog";
import { CandidateDeleteButton } from "@/components/app/hr/candidate-delete-button";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Candidate detail page. Pulled together server-side so the page
 * renders without client-side waterfalls; only the convert + checklist
 * + edit interactions are client components.
 *
 * Layout:
 *   - Header: name + status chip + Edit / Delete / Convert buttons
 *   - Prev-declined banner (if applicable)
 *   - Two columns: details (left) + onboarding (right, only when
 *     status has is_onboarding=true)
 */
export default async function CandidateDetailPage({ params }: PageProps) {
  await requireManagement();
  const { id } = await params;
  const [candidate, statuses] = await Promise.all([
    getCandidateById(id),
    listCandidateStatuses(),
  ]);
  if (!candidate) notFound();

  // Onboarding only needed if the status flag is set.
  const onboarding = candidate.status_is_onboarding
    ? await getOnboardingChecklistFor(id)
    : [];
  const activeOnboarding = onboarding.filter((i) => i.active);
  const remainingOnboarding = activeOnboarding.filter((i) => !i.completion).length;
  const onboardingComplete = activeOnboarding.length > 0 && remainingOnboarding === 0;

  const convertDisabled = !candidate.status_is_onboarding || !onboardingComplete;
  const convertReason = !candidate.status_is_onboarding
    ? "Move the candidate to an onboarding status first."
    : remainingOnboarding > 0
      ? `${remainingOnboarding} onboarding item${remainingOnboarding === 1 ? "" : "s"} still unchecked.`
      : undefined;

  // For the edit dialog we need a CandidateListItem-shaped object. The
  // dialog ignores the prev-declined fields when editing, so synthesize
  // them as false / null.
  const editShape = {
    ...candidate,
    status_name: candidate.status_name,
    status_color: candidate.status_color,
    previously_declined: false,
    previously_declined_at: null,
    previously_declined_id: null,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/hr/candidates"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to candidates
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {candidate.full_name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-wider",
                CANDIDATE_STATUS_CHIP_CLASSES[candidate.status_color],
              )}
            >
              {candidate.status_name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CandidateFormDialog
            statuses={statuses}
            candidate={editShape}
            trigger={
              <span className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors cursor-pointer">
                <Pencil className="h-4 w-4" />
                Edit
              </span>
            }
          />
          <ConvertToDriverDialog
            candidateId={candidate.id}
            candidateName={candidate.full_name}
            disabled={convertDisabled}
            disabledReason={convertReason}
          />
          <CandidateDeleteButton
            candidateId={candidate.id}
            candidateName={candidate.full_name}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <DetailCard candidate={candidate} />
        </div>
        {candidate.status_is_onboarding && (
          <CandidateOnboardingChecklist
            candidateId={candidate.id}
            items={onboarding}
          />
        )}
      </div>
    </div>
  );
}

function DetailCard({
  candidate,
}: {
  candidate: Awaited<ReturnType<typeof getCandidateById>>;
}) {
  if (!candidate) return null;
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold">Contact + interview</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Field label="Phone">
          {candidate.phone_display ? (
            <a
              href={`tel:${candidate.phone_digits ?? candidate.phone_display}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {formatPhone(candidate.phone_digits) || candidate.phone_display}
            </a>
          ) : (
            <Muted>not set</Muted>
          )}
        </Field>
        <Field label="Email">
          {candidate.email ? (
            <a
              href={`mailto:${candidate.email}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {candidate.email}
            </a>
          ) : (
            <Muted>not set</Muted>
          )}
        </Field>
        <Field label="Interview">
          {candidate.interview_dt ? (
            format(parseISO(candidate.interview_dt), "EEE MMM d, yyyy · h:mma").replace(":00", "")
          ) : (
            <Muted>not scheduled</Muted>
          )}
        </Field>
        <Field label="DSP">
          {candidate.interview_dsp || <Muted>not set</Muted>}
        </Field>
        <Field label="Source">
          {candidate.source || <Muted>not set</Muted>}
        </Field>
        <Field label="Created">
          {format(parseISO(candidate.created_at), "MMM d, yyyy")}
        </Field>
      </dl>
      {candidate.notes && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Notes
          </div>
          <p className="text-sm whitespace-pre-wrap">{candidate.notes}</p>
        </div>
      )}
      {candidate.archived_at && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 p-2.5 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            Archived on {format(parseISO(candidate.archived_at), "MMM d, yyyy")}.
            {candidate.converted_driver_id && (
              <>
                {" "}
                Converted to driver —{" "}
                <Link
                  href={`/drivers/${candidate.converted_driver_id}`}
                  className="underline"
                >
                  open driver record
                </Link>
                .
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground italic">{children}</span>;
}

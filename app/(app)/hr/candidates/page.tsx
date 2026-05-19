import Link from "next/link";
import { ChevronLeft, Archive } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import {
  listActiveCandidates,
  listCandidateStatuses,
  listOnboardingTemplate,
} from "@/lib/queries/hr-candidates";
import { CandidatesList } from "@/components/app/hr/candidates-list";
import { CandidateFormDialog } from "@/components/app/hr/candidate-form-dialog";
import { CandidateStatusesAdmin } from "@/components/app/hr/candidate-statuses-admin";
import { OnboardingTemplateAdmin } from "@/components/app/hr/onboarding-template-admin";

/**
 * Candidates pipeline. Collapsible-by-status list of every active
 * candidate, with inline editors for both the status list and the
 * onboarding template above.
 *
 * Detail page lives at `/hr/candidates/[id]`; archive at
 * `/hr/candidates/archive`.
 */
export default async function CandidatesPage() {
  await requireManagement();
  const [statuses, candidates, onboardingTemplate] = await Promise.all([
    listCandidateStatuses(),
    listActiveCandidates(),
    listOnboardingTemplate(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {candidates.length} active across {statuses.filter((s) => s.active).length} statuses.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CandidateFormDialog statuses={statuses} />
          <Link
            href="/hr/candidates/archive"
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Archive className="h-4 w-4" />
            Archive
          </Link>
          <Link
            href="/hr"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to HR
          </Link>
        </div>
      </div>

      <CandidateStatusesAdmin statuses={statuses} />
      <OnboardingTemplateAdmin items={onboardingTemplate} />

      <CandidatesList candidates={candidates} statuses={statuses} />
    </div>
  );
}

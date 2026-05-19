import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import {
  listActiveCandidates,
  listCandidateStatuses,
} from "@/lib/queries/hr-candidates";
import { CandidatesList } from "@/components/app/hr/candidates-list";
import { CandidateFormDialog } from "@/components/app/hr/candidate-form-dialog";
import { CandidateStatusesAdmin } from "@/components/app/hr/candidate-statuses-admin";

/**
 * Candidates pipeline. Pass C.A scope:
 *   - Collapsible-by-status list of every active candidate
 *   - Inline status admin (drag, rename, recolor, toggle declined-flag)
 *   - Add candidate dialog with live "previously declined" warning
 *
 * Detail page, onboarding checklist, convert-to-driver, and archive
 * view land in Pass C.B.
 */
export default async function CandidatesPage() {
  await requireManagement();
  const [statuses, candidates] = await Promise.all([
    listCandidateStatuses(),
    listActiveCandidates(),
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
            href="/hr"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to HR
          </Link>
        </div>
      </div>

      <CandidateStatusesAdmin statuses={statuses} />

      <CandidatesList candidates={candidates} statuses={statuses} />
    </div>
  );
}

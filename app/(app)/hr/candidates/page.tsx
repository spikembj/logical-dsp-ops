import Link from "next/link";
import {
  ChevronLeft,
  Archive,
  Settings2,
  ClipboardList,
  HelpCircle,
} from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import {
  listActiveCandidates,
  listCandidateStatuses,
} from "@/lib/queries/hr-candidates";
import { CandidatesList } from "@/components/app/hr/candidates-list";
import { CandidateFormDialog } from "@/components/app/hr/candidate-form-dialog";

/**
 * Candidates pipeline. Collapsible-by-status list of every active
 * candidate.
 *
 * Header buttons (mirror the Daily Ops pattern with Wave times):
 *   - Add candidate            (primary blue)
 *   - Statuses                 (config page at /hr/candidates/statuses)
 *   - Onboarding template      (config page at /hr/candidates/onboarding-template)
 *   - Archive                  (the /archive view)
 *
 * Detail page at `/hr/candidates/[id]`.
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
            {candidates.length} active across{" "}
            {statuses.filter((s) => s.active).length} statuses.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CandidateFormDialog statuses={statuses} />
          <Link
            href="/hr/candidates/statuses"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Settings2 className="h-4 w-4" />
            Statuses
          </Link>
          <Link
            href="/hr/candidates/onboarding-template"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ClipboardList className="h-4 w-4" />
            Onboarding template
          </Link>
          <Link
            href="/hr/candidates/interview-questions"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <HelpCircle className="h-4 w-4" />
            Interview questions
          </Link>
          <Link
            href="/hr/candidates/archive"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
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

      <CandidatesList candidates={candidates} statuses={statuses} />
    </div>
  );
}

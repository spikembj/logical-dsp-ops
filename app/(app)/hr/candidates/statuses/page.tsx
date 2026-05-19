import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { listCandidateStatuses } from "@/lib/queries/hr-candidates";
import { CandidateStatusesAdmin } from "@/components/app/hr/candidate-statuses-admin";

/**
 * Dedicated page for managing the candidate-pipeline status buckets.
 * Reached from the Statuses button on `/hr/candidates`. Same pattern as
 * `/admin/waves` for wave times — keeps the kanban view itself focused
 * on the candidates and pushes the config to its own surface.
 */
export default async function CandidateStatusesPage() {
  await requireManagement();
  const statuses = await listCandidateStatuses();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Candidate statuses
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Buckets that show up on the kanban. Drag to reorder; toggle
            visibility, declined-flag, and onboarding behavior per status.
          </p>
        </div>
        <Link
          href="/hr/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to candidates
        </Link>
      </div>

      <CandidateStatusesAdmin statuses={statuses} />
    </div>
  );
}

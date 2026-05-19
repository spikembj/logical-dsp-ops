import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { listArchivedCandidates } from "@/lib/queries/hr-candidates";
import { CandidatesArchiveClient } from "@/components/app/hr/candidates-archive-client";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Archive of every candidate ever — hired, declined, manually-archived.
 * Three tabs (All / Hired / Declined / Other), client-side search by
 * name / phone / status. All-time by default per the user's pick.
 *
 * Renders entirely server-side except the tab + search interactions,
 * which live in CandidatesArchiveClient.
 */
export default async function CandidatesArchivePage({ searchParams }: PageProps) {
  await requireManagement();
  const sp = await searchParams;
  const tab =
    sp.tab === "hired" || sp.tab === "declined" || sp.tab === "other"
      ? sp.tab
      : "all";

  const rows = await listArchivedCandidates();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Candidates archive
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} total ·{" "}
            {rows.filter((r) => r.outcome === "hired").length} hired ·{" "}
            {rows.filter((r) => r.outcome === "declined").length} declined
          </p>
        </div>
        <Link
          href="/hr/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to active
        </Link>
      </div>

      <CandidatesArchiveClient rows={rows} initialTab={tab} />
    </div>
  );
}

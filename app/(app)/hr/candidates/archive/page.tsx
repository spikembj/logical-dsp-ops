import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireManagement } from "@/lib/auth/require-role";
import { listArchivedCandidates } from "@/lib/queries/hr-candidates";
import {
  CANDIDATE_STATUS_CHIP_CLASSES,
  formatPhone,
} from "@/lib/queries/hr-candidates-types";
import { CandidatesArchiveClient } from "@/components/app/hr/candidates-archive-client";
import { cn } from "@/lib/utils";

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

/**
 * Archive of every candidate ever — hired, declined, manually-archived.
 * Three tabs (All / Hired / Declined), client-side search by name.
 * All-time by default per the user's pick.
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
            {rows.length} total · {rows.filter((r) => r.outcome === "hired").length} hired ·{" "}
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

      <CandidatesArchiveClient rows={rows} initialTab={tab}>
        {(filtered) => (
          <div className="rounded-xl border bg-card overflow-hidden">
            {filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing in this view.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((r) => (
                  <li
                    key={r.id}
                    className="px-4 py-3 flex items-center gap-3 flex-wrap"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/hr/candidates/${r.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {r.full_name}
                        </Link>
                        <span
                          className={cn(
                            "inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                            CANDIDATE_STATUS_CHIP_CLASSES[r.status_color],
                          )}
                        >
                          {r.status_name}
                        </span>
                        {r.outcome === "hired" && (
                          <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            hired
                          </span>
                        )}
                        {r.outcome === "declined" && (
                          <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            declined
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.phone_display && (
                          <span className="mr-3">
                            {formatPhone(r.phone_digits) || r.phone_display}
                          </span>
                        )}
                        Archived{" "}
                        {r.archived_at
                          ? format(parseISO(r.archived_at), "MMM d, yyyy")
                          : "—"}
                      </div>
                    </div>
                    {r.outcome === "hired" && r.converted_driver_id && (
                      <Link
                        href={`/drivers/${r.converted_driver_id}`}
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Open driver →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CandidatesArchiveClient>
    </div>
  );
}

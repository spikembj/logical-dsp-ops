"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  Phone,
  Calendar,
  AlertTriangle,
  Pencil,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  changeCandidateStatus,
  deleteCandidate,
} from "@/app/actions/hr-candidates";
import {
  CANDIDATE_STATUS_CHIP_CLASSES,
  formatPhone,
  type CandidateListItem,
  type CandidateStatusRow,
} from "@/lib/queries/hr-candidates-types";
import { CandidateFormDialog } from "./candidate-form-dialog";

/**
 * Collapsible-by-status list of every active candidate. Matches the
 * spreadsheet layout the user is used to:
 *   - One section per status, header showing the chunky color chip + count
 *   - Click the chevron to collapse / expand
 *   - Inside, candidate cards sorted by interview_dt asc (today/future
 *     first), then created_at desc for those without interviews yet
 *
 * Each card: name (links to detail page once Pass C.B ships, currently
 * placeholder), phone (tel: link), interview date, previously-declined
 * badge, inline status dropdown, edit + delete buttons.
 */
export function CandidatesList({
  candidates,
  statuses,
}: {
  candidates: CandidateListItem[];
  statuses: CandidateStatusRow[];
}) {
  // Persisted-per-render collapsed map. Default: all expanded. Switching
  // to localStorage persistence is a future polish — for now HR usually
  // wants to see everything anyway.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Group + sort once per render.
  const grouped = useMemo(() => {
    const map = new Map<string, CandidateListItem[]>();
    for (const c of candidates) {
      const arr = map.get(c.status_id) ?? [];
      arr.push(c);
      map.set(c.status_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        // Both have interview date — soonest upcoming first, then past.
        // Both null — most recently created first.
        // One null — the one WITH a date comes first.
        const ai = a.interview_dt;
        const bi = b.interview_dt;
        if (ai && bi) return ai.localeCompare(bi);
        if (ai) return -1;
        if (bi) return 1;
        return b.created_at.localeCompare(a.created_at);
      });
    }
    return map;
  }, [candidates]);

  const visibleStatuses = statuses.filter((s) => s.active);

  return (
    <div className="space-y-3">
      {visibleStatuses.map((s) => {
        const list = grouped.get(s.id) ?? [];
        const isCollapsed = collapsed[s.id] ?? false;
        return (
          <section
            key={s.id}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <header className="px-3 py-2 border-b bg-muted/30 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [s.id]: !isCollapsed }))
                }
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? "Expand" : "Collapse"}
                className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <span
                className={cn(
                  "inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-wider",
                  CANDIDATE_STATUS_CHIP_CLASSES[s.color],
                )}
              >
                {s.name}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {list.length}
              </span>
              {s.treat_as_declined && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  declined-flag
                </span>
              )}
              <div className="ml-auto">
                <CandidateFormDialog
                  statuses={statuses}
                  defaultStatusId={s.id}
                  trigger={
                    <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                      + Add to {s.name.toLowerCase()}
                    </span>
                  }
                />
              </div>
            </header>
            {!isCollapsed && (
              <>
                {list.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No candidates in this status.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {list.map((c) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        statuses={statuses}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CandidateRow({
  candidate,
  statuses,
}: {
  candidate: CandidateListItem;
  statuses: CandidateStatusRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleStatusChange(nextStatusId: string) {
    if (nextStatusId === candidate.status_id) return;
    startTransition(async () => {
      const res = await changeCandidateStatus({
        candidate_id: candidate.id,
        status_id: nextStatusId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete ${candidate.full_name}? This removes them entirely — use a status change if you only want to mark them declined.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCandidate({ candidate_id: candidate.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  const interviewLabel = candidate.interview_dt
    ? format(parseISO(candidate.interview_dt), "EEE MMM d, h:mma").replace(
        ":00",
        "",
      )
    : null;

  return (
    <li className="px-3 py-2 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/hr/candidates/${candidate.id}`}
            className="text-sm font-medium hover:underline truncate"
          >
            {candidate.full_name}
          </Link>
          {candidate.phone_display && (
            <a
              href={`tel:${candidate.phone_digits ?? candidate.phone_display}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-3 w-3" />
              {formatPhone(candidate.phone_digits) || candidate.phone_display}
            </a>
          )}
          {candidate.previously_declined && (
            <Link
              href={`#candidate-${candidate.previously_declined_id}`}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              title={
                candidate.previously_declined_at
                  ? `Previously declined on ${format(parseISO(candidate.previously_declined_at), "MMM d, yyyy")}`
                  : undefined
              }
            >
              <AlertTriangle className="h-3 w-3" />
              prev. declined
            </Link>
          )}
        </div>
        {interviewLabel && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {interviewLabel}
            {candidate.interview_dsp && (
              <span className="text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5 ml-1">
                {candidate.interview_dsp}
              </span>
            )}
          </div>
        )}
      </div>

      <select
        value={candidate.status_id}
        onChange={(e) => handleStatusChange(e.currentTarget.value)}
        disabled={pending}
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      >
        {statuses
          .filter((s) => s.active || s.id === candidate.status_id)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>

      <div className="inline-flex gap-0.5">
        <CandidateFormDialog
          statuses={statuses}
          candidate={candidate}
          trigger={
            <span
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title={`Edit ${candidate.full_name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </span>
          }
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Delete candidate"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

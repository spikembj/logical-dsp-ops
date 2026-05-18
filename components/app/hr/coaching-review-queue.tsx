"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Check, Search, Undo2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markCoachingReviewed,
  unmarkCoachingReviewed,
  updateReviewNotes,
} from "@/app/actions/hr";
import { COACHING_CATEGORY_LABELS } from "@/lib/util/coaching-prefill";
import type {
  HrCoachingReviewRow,
  HrQueueMode,
} from "@/lib/queries/hr-types";

const SESSION_TYPE_CHIP: Record<string, string> = {
  verbal_warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  write_up:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  final_warning:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  termination:
    "bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-100 font-semibold",
};

function prettySessionType(t: string): string {
  return t.replace(/_/g, " ");
}

/**
 * HR's review queue. Defaults to showing only sessions still awaiting
 * sign-off; the header tabs flip to "All" or "Reviewed only". Local
 * search filters by driver name / topic / coach name without a
 * round-trip.
 *
 * The Reviewed button opens an inline notes editor; saving stamps the
 * row server-side and (because the default mode is unreviewed) the row
 * drops out of the visible list. Already-reviewed rows get an Undo +
 * "edit notes" affordance so HR can correct mistakes without leaving
 * the page.
 */
export function CoachingReviewQueue({
  rows,
  mode,
}: {
  rows: HrCoachingReviewRow[];
  mode: HrQueueMode;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.driver_name} ${r.topic} ${r.coached_by_name ?? ""} ${
        COACHING_CATEGORY_LABELS[r.category] ?? r.category
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  function setMode(next: HrQueueMode) {
    const url = new URL(window.location.href);
    if (next === "unreviewed") url.searchParams.delete("mode");
    else url.searchParams.set("mode", next);
    router.push(`${url.pathname}${url.search}`);
  }

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-3 justify-between p-4 border-b">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold">Coaching review queue</h2>
          <div className="inline-flex rounded-md border overflow-hidden text-xs">
            <ModeTab current={mode} value="unreviewed" onClick={setMode}>
              Unreviewed
            </ModeTab>
            <ModeTab current={mode} value="reviewed" onClick={setMode}>
              Reviewed
            </ModeTab>
            <ModeTab current={mode} value="all" onClick={setMode}>
              All
            </ModeTab>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search driver, topic, coach…"
            className="h-8 pl-7 pr-2 rounded-md border bg-background text-xs w-64 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {mode === "unreviewed"
            ? "Nothing waiting on HR review. ✓"
            : "No sessions match."}
        </p>
      ) : (
        <ul className="divide-y">
          {filtered.map((r) => (
            <ReviewRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeTab({
  current,
  value,
  onClick,
  children,
}: {
  current: HrQueueMode;
  value: HrQueueMode;
  onClick: (v: HrQueueMode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "px-2.5 py-1 transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ReviewRow({ row }: { row: HrCoachingReviewRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composing, setComposing] = useState(false);
  // Pre-populate the textarea with whatever HR last wrote so editing
  // notes after marking reviewed does not start from blank.
  const [notes, setNotes] = useState(row.hr_review_notes ?? "");
  const reviewed = !!row.hr_reviewed_at;

  function save() {
    startTransition(async () => {
      // If we are editing an already-reviewed row, just update the notes;
      // otherwise this is the first review stamp.
      const action = reviewed ? updateReviewNotes : markCoachingReviewed;
      const res = await action({
        session_id: row.id,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(reviewed ? "Notes saved." : "Marked reviewed.");
      setComposing(false);
      router.refresh();
    });
  }

  function undo() {
    if (!confirm("Re-open this session in the unreviewed queue?")) return;
    startTransition(async () => {
      const res = await unmarkCoachingReviewed({ session_id: row.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Re-opened. HR notes preserved.");
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "p-3 transition-colors",
        row.voided_at && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/drivers/${row.driver_id}`}
              className="text-sm font-medium hover:underline truncate"
            >
              {row.driver_name}
            </Link>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
                SESSION_TYPE_CHIP[row.session_type] ??
                  "bg-muted text-muted-foreground",
              )}
            >
              {prettySessionType(row.session_type)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {COACHING_CATEGORY_LABELS[row.category] ?? row.category}
            </span>
            {row.voided_at && (
              <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                voided
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm">{row.topic}</div>
          {row.notes && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {row.notes}
            </p>
          )}
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            {format(parseISO(row.session_date), "MMM d, yyyy")}
            {row.coached_by_name && <> · by {row.coached_by_name}</>}
            {reviewed && (
              <>
                {" · "}
                <span className="text-emerald-700 dark:text-emerald-400">
                  reviewed
                  {row.hr_reviewed_at && (
                    <> {format(parseISO(row.hr_reviewed_at), "MMM d")}</>
                  )}
                  {row.hr_reviewed_by_name && (
                    <> by {row.hr_reviewed_by_name}</>
                  )}
                </span>
              </>
            )}
          </div>
          {reviewed && row.hr_review_notes && !composing && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              HR note: {row.hr_review_notes}
            </p>
          )}
        </div>

        {/* Actions column */}
        <div className="shrink-0 flex items-center gap-1">
          {!composing && !reviewed && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              disabled={pending || !!row.voided_at}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-3.5 w-3.5" />
              Reviewed
            </button>
          )}
          {!composing && reviewed && (
            <>
              <button
                type="button"
                onClick={() => setComposing(true)}
                disabled={pending}
                aria-label="Edit HR note"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={undo}
                disabled={pending}
                aria-label="Re-open in queue"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {composing && (
        <div className="mt-2 space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
            placeholder="Optional note — e.g. 'sent termination letter', 'verified with Curtis'"
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={pending}
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setNotes(row.hr_review_notes ?? "");
                setComposing(false);
              }}
              disabled={pending}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {reviewed ? "Save note" : "Confirm reviewed"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

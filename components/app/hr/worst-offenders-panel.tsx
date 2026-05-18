"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import {
  COACHING_CATEGORY_GROUPS,
  COACHING_CATEGORY_LABELS,
  type CoachingCategory,
} from "@/lib/util/coaching-prefill";
import type { OffenderRow } from "@/lib/queries/hr-types";

/**
 * Worst-10 drivers by coaching count over the last 90 days, excluding
 * trainings + discussions and voided sessions. Category dropdown
 * (default "All") drives a `?cat=…` search-param round-trip so the
 * server query re-runs with the new filter and the panel updates with
 * fresh counts.
 *
 * Why server-driven instead of filtering client-side: the offender list
 * differs per category (a driver with 0 safety sessions but 4 escalation
 * sessions only appears under one filter). Easier to re-query than to
 * pre-load every breakdown.
 */
export function WorstOffendersPanel({
  rows,
  selected,
}: {
  rows: OffenderRow[];
  /** Current category filter, or "all". Reflected in ?cat=… */
  selected: CoachingCategory | "all";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function changeCategory(v: string) {
    setPending(true);
    const url = new URL(window.location.href);
    if (v === "all") url.searchParams.delete("cat");
    else url.searchParams.set("cat", v);
    router.push(`${url.pathname}${url.search}`);
  }

  const maxCount = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.session_count), 0),
    [rows],
  );

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Worst 10 — last 90 days</h2>
        </div>
        <select
          value={selected}
          onChange={(e) => changeCategory(e.currentTarget.value)}
          disabled={pending}
          className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="all">All categories</option>
          {COACHING_CATEGORY_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.values.map((c) => (
                <option key={c} value={c}>
                  {COACHING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-muted-foreground mb-2">
        Counts exclude trainings, discussions, and voided sessions.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No drivers with reviewable coaching in this window. ✓
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.driver_id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground tabular-nums w-5 text-right">
                {i + 1}.
              </span>
              <Link
                href={`/drivers/${r.driver_id}`}
                className="text-sm font-medium hover:underline truncate flex-1 min-w-0"
              >
                {r.driver_name}
              </Link>
              {/* Mini bar so the relative weights are visible at a glance.
                  Bar width is proportional to the leader, not to a fixed
                  scale — keeps it readable whether the leader has 3 or 30. */}
              <div className="hidden sm:block h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500/70"
                  style={{
                    width: `${Math.max(8, (r.session_count / maxCount) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums w-6 text-right">
                {r.session_count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

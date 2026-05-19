"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CANDIDATE_STATUS_CHIP_CLASSES,
  formatPhone,
  type ArchivedCandidateRow,
} from "@/lib/queries/hr-candidates-types";

type Tab = "all" | "hired" | "declined" | "other";

/**
 * Tab + search + list rendering for the archive page. Lives entirely
 * on the client so the page can pass its data array down as a plain
 * prop (Server Components cannot pass function children to Client
 * Components — earlier render-prop shape was the cause of the
 * server-error landing).
 */
export function CandidatesArchiveClient({
  rows,
  initialTab,
}: {
  rows: ArchivedCandidateRow[];
  initialTab: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let out = rows;
    if (tab !== "all") out = out.filter((r) => r.outcome === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.phone_digits ?? "").includes(q) ||
          r.status_name.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, tab, search]);

  function changeTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    router.replace(`${url.pathname}${url.search}`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex rounded-md border overflow-hidden text-xs">
          <TabButton current={tab} value="all" onClick={changeTab}>
            All
          </TabButton>
          <TabButton current={tab} value="hired" onClick={changeTab}>
            Hired
          </TabButton>
          <TabButton current={tab} value="declined" onClick={changeTab}>
            Declined
          </TabButton>
          <TabButton current={tab} value="other" onClick={changeTab}>
            Other
          </TabButton>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search name, phone, status…"
            className="h-8 pl-7 pr-2 rounded-md border bg-background text-xs w-64 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

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
    </>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (v: Tab) => void;
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

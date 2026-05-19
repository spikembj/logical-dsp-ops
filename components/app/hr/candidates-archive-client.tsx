"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchivedCandidateRow } from "@/lib/queries/hr-candidates-types";

type Tab = "all" | "hired" | "declined" | "other";

/**
 * Render-prop client that owns the tab + search state for the archive
 * page. We push the active tab to the URL so the back button works
 * naturally and tabs are linkable. Search is client-only — archives
 * stay short enough that a fuzzy filter in memory is fine.
 */
export function CandidatesArchiveClient({
  rows,
  initialTab,
  children,
}: {
  rows: ArchivedCandidateRow[];
  initialTab: Tab;
  children: (filtered: ArchivedCandidateRow[]) => React.ReactNode;
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
      {children(filtered)}
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

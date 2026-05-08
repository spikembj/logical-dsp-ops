"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ChevronUp, ShieldAlert, FileWarning } from "lucide-react";
import { LogSessionDialog } from "@/components/app/coaching/log-session-dialog";
import type { DashboardData } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";

const COUNT_OPTIONS = [15, 30, 50, "all"] as const;
type CountOption = (typeof COUNT_OPTIONS)[number];

type Mode = "safety" | "quality";

type Row = DashboardData["needsCoachingSafety"][number];

interface Props {
  safety: DashboardData["needsCoachingSafety"];
  quality: DashboardData["needsCoachingQuality"];
}

export function NeedsCoachingList({ safety, quality }: Props) {
  const [mode, setMode] = useState<Mode>("safety");
  const [count, setCount] = useState<CountOption>(15);
  const [collapsed, setCollapsed] = useState(false);

  const list = mode === "safety" ? safety : quality;
  const visible = useMemo(() => {
    if (count === "all") return list;
    return list.slice(0, count);
  }, [list, count]);

  return (
    <section className="space-y-2">
      {/* Header bar: title, mode toggle, count selector, collapse */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 text-base font-medium hover:text-foreground/80"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Needs coaching this week
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Safety / Quality toggle */}
          <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("safety")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-sm transition-colors",
                mode === "safety"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Safety
              <span
                className={cn(
                  "ml-1 inline-flex items-center justify-center min-w-[1.25rem] rounded-full px-1 text-[10px] font-semibold",
                  mode === "safety"
                    ? "bg-background/20"
                    : "bg-muted text-foreground/60",
                )}
              >
                {safety.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("quality")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-sm transition-colors",
                mode === "quality"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileWarning className="h-3.5 w-3.5" />
              Quality
              <span
                className={cn(
                  "ml-1 inline-flex items-center justify-center min-w-[1.25rem] rounded-full px-1 text-[10px] font-semibold",
                  mode === "quality"
                    ? "bg-background/20"
                    : "bg-muted text-foreground/60",
                )}
              >
                {quality.length}
              </span>
            </button>
          </div>

          {/* Show-N picker */}
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Show
            <select
              value={count}
              onChange={(e) =>
                setCount(
                  e.currentTarget.value === "all"
                    ? "all"
                    : (Number(e.currentTarget.value) as CountOption),
                )
              }
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring"
            >
              {COUNT_OPTIONS.map((opt) => (
                <option key={String(opt)} value={String(opt)}>
                  {opt === "all" ? "All" : opt}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!collapsed && (
        <>
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {mode === "safety"
                  ? "No drivers with uncoached impacting safety events. 🎉"
                  : "No drivers with quality issues this week. 🎉"}
              </p>
            </div>
          ) : (
            <ul className="rounded-xl border bg-card divide-y">
              {visible.map((d) => (
                <RowItem key={d.driver_id} d={d} mode={mode} />
              ))}
              {count !== "all" && list.length > visible.length && (
                <li className="px-4 py-2 text-center text-xs text-muted-foreground">
                  Showing {visible.length} of {list.length}.{" "}
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline"
                    onClick={() => setCount("all")}
                  >
                    Show all
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function RowItem({ d, mode }: { d: Row; mode: Mode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <Link
          href={`/drivers/${d.driver_id}`}
          className="text-sm font-medium hover:underline"
        >
          {d.full_name}
        </Link>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {mode === "safety" ? (
            <>
              {d.total_events} impacting{" "}
              {d.total_events === 1 ? "event" : "events"}
              {d.event_types.length > 0 && (
                <>
                  {" · "}
                  <span title={d.event_types.join(", ")}>
                    {d.event_types.slice(0, 3).join(", ")}
                    {d.event_types.length > 3 && ` +${d.event_types.length - 3}`}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              {d.total_events} quality{" "}
              {d.total_events === 1 ? "issue" : "issues"}
              {d.issues.length > 0 && (
                <>
                  {" · "}
                  <span title={d.issues.join("; ")}>
                    {d.issues.slice(0, 3).join("; ")}
                    {d.issues.length > 3 && ` +${d.issues.length - 3}`}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <LogSessionDialog driverId={d.driver_id} driverName={d.full_name} />
      <Link
        href={`/drivers/${d.driver_id}`}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Open ${d.full_name} profile`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </li>
  );
}

// Re-export so it can be a server-imported barrel later if we want.
export { ChevronUp };

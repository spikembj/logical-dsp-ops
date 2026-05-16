"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { amazonWeekFromEndingDate } from "@/lib/format/dates";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SafetyEventSeriesPoint } from "@/lib/queries/dashboard";

const PALETTE = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#ef4444", // red
];

/**
 * Company-wide safety event trend by event type. Toggle between
 * impacting and non-impacting on the right; whatever's selected drives
 * which series array is rendered. Each event type gets its own line,
 * colored from the palette. Defaults to the top 4 highest-volume types
 * being active; the user can toggle others on/off via legend pills.
 */
export function SafetyTrendChart({
  impacting,
  nonImpacting,
}: {
  impacting: SafetyEventSeriesPoint[];
  nonImpacting: SafetyEventSeriesPoint[];
}) {
  const [mode, setMode] = useState<"impacting" | "non_impacting">("impacting");
  const series = mode === "impacting" ? impacting : nonImpacting;

  // Aggregate total events per type across the window, pick top 4 for
  // default "on" state. Below-top-4 types start hidden but appear in the
  // toggle row so the user can opt them in.
  const allTypes = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of series) {
      for (const [t, c] of Object.entries(p.by_type)) {
        totals.set(t, (totals.get(t) ?? 0) + c);
      }
    }
    return [...totals.entries()]
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
  }, [series]);

  const [active, setActive] = useState<Set<string>>(() => new Set());
  // Reset/seed active set whenever mode or series shape changes — start
  // with the top 4 types selected.
  const defaultActive = useMemo(
    () => new Set(allTypes.slice(0, 4)),
    [allTypes],
  );
  const currentActive = active.size === 0 ? defaultActive : active;

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    allTypes.forEach((t, i) => m.set(t, PALETTE[i % PALETTE.length]!));
    return m;
  }, [allTypes]);

  const data = useMemo(() => {
    return series.map((p) => {
      const { week, year } = amazonWeekFromEndingDate(p.week_ending);
      const row: Record<string, string | number> = {
        label: `W${week}`,
        weekFull: `Week ${week}, ${year}`,
      };
      for (const t of allTypes) row[t] = p.by_type[t] ?? 0;
      return row;
    });
  }, [series, allTypes]);

  function toggle(t: string) {
    setActive((prev) => {
      const base = prev.size === 0 ? new Set(defaultActive) : new Set(prev);
      if (base.has(t)) base.delete(t);
      else base.add(t);
      return base;
    });
  }

  if (data.length < 2 || allTypes.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Company safety trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              No safety event data yet.
            </p>
          </div>
          <SeverityToggle mode={mode} setMode={setMode} />
        </div>
        <p className="text-xs text-muted-foreground italic py-8 text-center">
          Trend chart needs at least two weeks of safety event data.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Company safety trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weekly {mode === "impacting" ? "impacting" : "non-impacting"}{" "}
            event counts · last {data.length}{" "}
            {data.length === 1 ? "week" : "weeks"} on record.
          </p>
        </div>
        <SeverityToggle mode={mode} setMode={setMode} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <XAxis
              dataKey="label"
              stroke="currentColor"
              strokeOpacity={0.5}
              fontSize={11}
              tickLine={false}
              axisLine={{ strokeOpacity: 0.2 }}
            />
            <YAxis
              stroke="currentColor"
              strokeOpacity={0.5}
              fontSize={11}
              tickLine={false}
              axisLine={{ strokeOpacity: 0.2 }}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(_, payload) =>
                (payload?.[0]?.payload as { weekFull: string } | undefined)
                  ?.weekFull ?? ""
              }
            />
            {allTypes.map((t) =>
              currentActive.has(t) ? (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  stroke={colorFor.get(t) ?? "#888"}
                  strokeWidth={1.75}
                  dot={{ r: 2.5, strokeWidth: 0, fill: colorFor.get(t) }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allTypes.map((t) => {
          const on = currentActive.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded-md border transition-colors inline-flex items-center gap-1.5",
                on
                  ? "border-foreground/20 bg-card"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: on ? colorFor.get(t) : "currentColor",
                }}
              />
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeverityToggle({
  mode,
  setMode,
}: {
  mode: "impacting" | "non_impacting";
  setMode: (m: "impacting" | "non_impacting") => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setMode("impacting")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-sm transition-colors",
          mode === "impacting"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ShieldAlert className="h-3 w-3" />
        Impacting
      </button>
      <button
        type="button"
        onClick={() => setMode("non_impacting")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-sm transition-colors",
          mode === "non_impacting"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Non-impacting
      </button>
    </div>
  );
}

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
import { cn } from "@/lib/utils";

/**
 * Minimum shape the chart needs. Per-driver scorecards and company-wide
 * weekly averages both fit (extras are ignored via structural typing).
 */
export interface TrendPoint {
  week_ending: string;
  overall_score: number | null;
  dcr: number | null;
  pod: number | null;
}

type SeriesKey = "overall_score" | "dcr" | "pod";

const SERIES: {
  key: SeriesKey;
  label: string;
  stroke: string;
}[] = [
  { key: "overall_score", label: "Overall", stroke: "#10b981" },
  { key: "dcr", label: "DCR", stroke: "#3b82f6" },
  { key: "pod", label: "POD", stroke: "#a855f7" },
];

/**
 * Multi-series line chart for weekly performance metrics. Single Y-axis
 * (Overall is 0-100, DCR/POD are %, all share the same upper-bounded scale).
 *
 * Used in two places:
 *   - Per-driver Performance tab — `scorecards` is one row per week for one driver.
 *   - Performance dashboard (home) — `scorecards` is per-week company averages.
 *
 * The two callers differ only in title/description, supplied via props.
 */
export function PerformanceTrendChart({
  scorecards,
  title = "Performance trend",
  description,
}: {
  scorecards: TrendPoint[];
  title?: string;
  description?: string;
}) {
  const [active, setActive] = useState<Set<SeriesKey>>(
    () => new Set(["overall_score", "dcr", "pod"]),
  );

  const data = useMemo(() => {
    // Newest first → oldest first for chart left-to-right reading.
    const ordered = [...scorecards]
      .sort((a, b) => (a.week_ending < b.week_ending ? -1 : 1))
      .slice(-12);
    return ordered.map((s) => {
      const { week, year } = amazonWeekFromEndingDate(s.week_ending);
      return {
        label: `W${week}`,
        weekFull: `Week ${week}, ${year}`,
        overall_score: s.overall_score,
        dcr: s.dcr,
        pod: s.pod,
      };
    });
  }, [scorecards]);

  const defaultDescription =
    data.length === 0
      ? "No weeks on record."
      : `Last ${data.length} ${data.length === 1 ? "week" : "weeks"} on record.`;

  if (data.length < 2) {
    return (
      <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground italic">
        Trend chart needs at least two weeks of scorecards.
      </div>
    );
  }

  function toggle(k: SeriesKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description ?? defaultDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => {
            const on = active.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md border transition-colors inline-flex items-center gap-1.5",
                  on
                    ? "border-foreground/20 bg-card"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: on ? s.stroke : "currentColor" }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
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
              domain={[
                (dataMin: number) => Math.floor(Math.min(dataMin, 90)),
                100,
              ]}
              stroke="currentColor"
              strokeOpacity={0.5}
              fontSize={11}
              tickLine={false}
              axisLine={{ strokeOpacity: 0.2 }}
              width={36}
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
            {SERIES.map((s) =>
              active.has(s.key) ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.stroke}
                  strokeWidth={s.key === "overall_score" ? 2.5 : 1.75}
                  dot={{ r: 3, strokeWidth: 0, fill: s.stroke }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

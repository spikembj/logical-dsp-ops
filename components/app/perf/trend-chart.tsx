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

interface ScorecardLite {
  week_ending: string;
  overall_score: number | null;
  dcr: number | null;
  pod: number | null;
  fico_score: number | null;
}

type SeriesKey = "overall_score" | "dcr" | "pod" | "fico_score";

const SERIES: {
  key: SeriesKey;
  label: string;
  stroke: string;
  description: string;
}[] = [
  {
    key: "overall_score",
    label: "Overall",
    stroke: "#10b981",
    description: "0–100",
  },
  { key: "dcr", label: "DCR", stroke: "#3b82f6", description: "%" },
  { key: "pod", label: "POD", stroke: "#a855f7", description: "%" },
  {
    key: "fico_score",
    label: "FICO",
    stroke: "#f59e0b",
    description: "0–1000",
  },
];

/**
 * Multi-series line chart of the driver's recent weekly performance.
 * X axis = week label ("W17"); Y axis = metric value. Each series can
 * be toggled on/off. By default Overall + DCR + POD show; FICO is off
 * because its 0–1000 range squashes the others on the same axis.
 */
export function PerformanceTrendChart({
  scorecards,
}: {
  scorecards: ScorecardLite[];
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
        fico_score: s.fico_score,
      };
    });
  }, [scorecards]);

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

  // FICO uses its own Y-axis since its 0–1000 range doesn't share with %.
  const ficoActive = active.has("fico_score");

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Performance trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last {data.length} {data.length === 1 ? "week" : "weeks"} on
            record.
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
              yAxisId="pct"
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
            {ficoActive && (
              <YAxis
                yAxisId="fico"
                orientation="right"
                domain={[0, 1000]}
                stroke="currentColor"
                strokeOpacity={0.5}
                fontSize={11}
                tickLine={false}
                axisLine={{ strokeOpacity: 0.2 }}
                width={40}
              />
            )}
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
                  yAxisId={s.key === "fico_score" ? "fico" : "pct"}
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

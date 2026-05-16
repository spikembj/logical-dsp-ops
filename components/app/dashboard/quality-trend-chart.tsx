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
import type { CompanyTrendPoint } from "@/lib/queries/dashboard";

/**
 * Quality company-trend chart with a toggle between two scale-incompatible
 * series sets:
 *
 *   - **Percentage** (default): Overall / DCR / POD — all 0-100, higher is better
 *   - **DPMO / count**: CDF DPMO / DSB DPMO / CED count — lower is better,
 *     unbounded high end
 *
 * Couldn't fit both on the same chart cleanly (the DPMO numbers crush the
 * percentage lines toward zero). Toggle is the simplest fix.
 */
type Mode = "percent" | "dpmo";

interface SeriesDef {
  key: keyof CompanyTrendPoint;
  label: string;
  stroke: string;
}

const PERCENT_SERIES: SeriesDef[] = [
  { key: "overall_score", label: "Overall", stroke: "#10b981" },
  { key: "dcr", label: "DCR", stroke: "#3b82f6" },
  { key: "pod", label: "POD", stroke: "#a855f7" },
];

const DPMO_SERIES: SeriesDef[] = [
  { key: "cdf", label: "CDF DPMO", stroke: "#3b82f6" },
  { key: "dsb", label: "DSB DPMO", stroke: "#a855f7" },
  { key: "ced", label: "CED", stroke: "#f59e0b" },
];

export function QualityTrendChart({
  points,
}: {
  points: CompanyTrendPoint[];
}) {
  const [mode, setMode] = useState<Mode>("percent");
  const series = mode === "percent" ? PERCENT_SERIES : DPMO_SERIES;
  const [active, setActive] = useState<Set<string>>(
    () => new Set(series.map((s) => s.key as string)),
  );

  const data = useMemo(() => {
    return points.map((p) => {
      const { week, year } = amazonWeekFromEndingDate(p.week_ending);
      return {
        label: `W${week}`,
        weekFull: `Week ${week}, ${year}`,
        overall_score: p.overall_score,
        dcr: p.dcr,
        pod: p.pod,
        cdf: p.cdf,
        dsb: p.dsb,
        ced: p.ced,
      };
    });
  }, [points]);

  // Reset active set when mode flips — saves the user from a confusing
  // "nothing visible" state if they had toggled off the now-irrelevant set.
  function flipMode(m: Mode) {
    setMode(m);
    setActive(
      new Set(
        (m === "percent" ? PERCENT_SERIES : DPMO_SERIES).map(
          (s) => s.key as string,
        ),
      ),
    );
  }

  if (data.length < 2) {
    return (
      <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground italic">
        Trend chart needs at least two weeks of scorecards.
      </div>
    );
  }

  function toggle(k: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Percent chart pins the Y to a 0-100 window starting near the data min.
  // DPMO chart auto-scales (defaults are wild — CDF can be 0-3000, CED 0-5).
  const yDomain: [
    "auto" | number | ((v: number) => number),
    "auto" | number | ((v: number) => number),
  ] =
    mode === "percent"
      ? [(dataMin: number) => Math.floor(Math.min(dataMin, 90)), 100]
      : [0, "auto"];

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Company quality trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last {data.length} {data.length === 1 ? "week" : "weeks"} ·{" "}
            {mode === "percent"
              ? "percent metrics (higher is better)"
              : "defect rates (lower is better)"}
          </p>
        </div>
        <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => flipMode("percent")}
            className={cn(
              "px-2.5 py-1 rounded-sm transition-colors",
              mode === "percent"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Percent
          </button>
          <button
            type="button"
            onClick={() => flipMode("dpmo")}
            className={cn(
              "px-2.5 py-1 rounded-sm transition-colors",
              mode === "dpmo"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            DPMO / count
          </button>
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
              domain={yDomain}
              stroke="currentColor"
              strokeOpacity={0.5}
              fontSize={11}
              tickLine={false}
              axisLine={{ strokeOpacity: 0.2 }}
              width={mode === "percent" ? 36 : 44}
              allowDecimals={mode === "percent"}
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
            {series.map((s) =>
              active.has(s.key as string) ? (
                <Line
                  key={s.key as string}
                  type="monotone"
                  dataKey={s.key as string}
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
      <div className="flex flex-wrap gap-1.5">
        {series.map((s) => {
          const on = active.has(s.key as string);
          return (
            <button
              key={s.key as string}
              type="button"
              onClick={() => toggle(s.key as string)}
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
  );
}

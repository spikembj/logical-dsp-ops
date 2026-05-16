"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";
import { amazonWeekFromEndingDate } from "@/lib/format/dates";
import type { DefectMix } from "@/lib/queries/dashboard";

const PALETTE = [
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#ef4444",
];

interface RowItem {
  type: string;
  count: number;
}

/**
 * Two donuts side-by-side for the Quality dashboard: Negative CDF mix on
 * the left, DSB defect mix on the right. Both rolling last 7 days.
 *
 * DSB data comes from concessions filtered to impacts_dsb=true — same
 * underlying CSV Amazon also exposes as a standalone "DSB Report" but we
 * don't need a separate parser/table for it.
 */
export function QualityDonuts({
  cdf,
  dsb,
}: {
  cdf: DefectMix;
  dsb: DefectMix;
}) {
  // Both mixes share the same window (latest scorecard week, Sun-Sat).
  // Surface it once at the section level. If there are no scorecards yet,
  // rangeStart/rangeEnd are empty strings — show a fallback subtitle.
  const haveRange = cdf.rangeStart !== "" && cdf.rangeEnd !== "";
  const startLabel = haveRange
    ? format(parseISO(cdf.rangeStart), "MMM d")
    : null;
  const endLabel = haveRange
    ? format(parseISO(cdf.rangeEnd), "MMM d")
    : null;
  const weekNumber = haveRange
    ? amazonWeekFromEndingDate(cdf.rangeEnd).week
    : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium">Quality defect mix</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {haveRange
            ? `Week ${weekNumber} · ${startLabel} – ${endLabel}`
            : "No scorecard week on file yet"}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Donut
          title="Negative CDF"
          subtitle="Customer feedback flags"
          total={cdf.total}
          byType={cdf.byType}
          emptyMessage="No negative customer feedback this week."
        />
        <Donut
          title="DSB"
          subtitle="DSB-impacting concession defects"
          total={dsb.total}
          byType={dsb.byType}
          emptyMessage="No DSB-impacting defects this week."
        />
      </div>
    </section>
  );
}

function Donut({
  title,
  subtitle,
  total,
  byType,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  total: number;
  byType: RowItem[];
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {total} {total === 1 ? "flag" : "flags"}
        </p>
      </div>
      {byType.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-12 text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid grid-cols-[8rem_1fr] gap-4 items-center">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="count"
                  nameKey="type"
                  innerRadius="62%"
                  outerRadius="95%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {byType.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => [`${value}`, `${name}`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 space-y-1 text-xs">
            {byType.map((t, i) => (
              <li
                key={t.type}
                className="flex items-center gap-2 leading-tight"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 truncate" title={t.type}>
                  {t.type}
                </span>
                <span className="tabular-nums font-medium">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

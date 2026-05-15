"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { SafetyMix } from "@/lib/queries/dashboard";

/**
 * Color palette for safety event types. Saturated mid-tones — readable on
 * both light and dark backgrounds. Cycles if there are more than 10 types,
 * which there usually aren't (Netradyne has ~15 distinct types total but
 * most weeks see only 3-6).
 */
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

interface RowItem {
  event_type: string;
  count: number;
}

/**
 * Two donut charts side by side: impacting + non-impacting safety event
 * mix for the previous completed Amazon week (Sun-Sat). Each donut shares
 * a legend list to the right (or below on mobile) with type + count.
 *
 * Renders a single section header showing the week range; both donuts
 * share that window.
 */
export function SafetyEventDonuts({ mix }: { mix: SafetyMix }) {
  const rangeLabel =
    mix.weekStart && mix.weekEnd
      ? `Week of ${format(parseISO(mix.weekStart), "MMM d")} – ${format(parseISO(mix.weekEnd), "MMM d")}`
      : "No safety data yet";
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium">Safety event mix</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {rangeLabel}
          {mix.hasData && (
            <>
              {" "}
              <span className="text-muted-foreground/70">
                · from your latest Netradyne upload
              </span>
            </>
          )}
        </p>
      </div>
      {!mix.hasData ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No safety events on file yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a Netradyne CSV on the{" "}
            <a
              href="/import"
              className="underline-offset-4 hover:underline text-foreground"
            >
              Import
            </a>{" "}
            page to populate this section.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SafetyDonut
            title="Impacting"
            total={mix.impacting.total}
            byType={mix.impacting.byType}
          />
          <SafetyDonut
            title="Non-impacting"
            total={mix.nonImpacting.total}
            byType={mix.nonImpacting.byType}
          />
        </div>
      )}
    </section>
  );
}

function SafetyDonut({
  title,
  total,
  byType,
}: {
  title: string;
  total: number;
  byType: RowItem[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {total} {total === 1 ? "event" : "events"}
        </p>
      </div>
      {byType.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-12 text-center">
          No {title.toLowerCase()} events this week.
        </p>
      ) : (
        <div className="grid grid-cols-[8rem_1fr] gap-4 items-center">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="count"
                  nameKey="event_type"
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
                key={t.event_type}
                className="flex items-center gap-2 leading-tight"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 truncate" title={t.event_type}>
                  {t.event_type}
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

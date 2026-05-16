"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatSessionDate } from "@/lib/format/dates";
import type { SafetyEventRow } from "@/lib/queries/safety-events";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null as number | null },
];

export function SafetyEventList({ events }: { events: SafetyEventRow[] }) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [showNonImpacting, setShowNonImpacting] = useState(false);

  const filtered = useMemo(() => {
    const range = RANGES[rangeIdx];
    const cutoff =
      range.days === null
        ? null
        : new Date(Date.now() - range.days * 86_400_000);
    return events.filter((e) => {
      if (cutoff && new Date(e.event_date) < cutoff) return false;
      if (!showNonImpacting && e.severity === "non_impacting") return false;
      return true;
    });
  }, [events, rangeIdx, showNonImpacting]);

  const totalCount = filtered.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={cn(
                "px-3 py-1 text-xs rounded-md transition-colors",
                rangeIdx === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={showNonImpacting}
            onCheckedChange={(v) => setShowNonImpacting(Boolean(v))}
          />
          <span>Show non-impacting</span>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length === 0
          ? "No events in this window."
          : `${filtered.length} ${filtered.length === 1 ? "row" : "rows"} (${totalCount} total events)`}
      </p>

      {filtered.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Event type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {formatSessionDate(e.event_date.slice(0, 10))}
                  </TableCell>
                  <TableCell>{e.event_type}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        e.severity === "impacting"
                          ? "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400"
                          : "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:text-zinc-400"
                      }
                    >
                      {e.severity === "impacting"
                        ? "Impacting"
                        : "Non-impacting"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.count}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground capitalize">
                    {e.source}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

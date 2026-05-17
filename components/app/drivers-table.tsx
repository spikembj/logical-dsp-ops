"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, TierBadge } from "@/lib/format/badges";
import { formatSessionDate, relativeFromNow } from "@/lib/format/dates";
import type { DriverPosition, DriverStatus } from "@/lib/types/database";
import type { DriverListItem } from "@/lib/queries/drivers";
import { Search, X } from "lucide-react";
import { DriverFormDialog } from "@/components/app/driver-form-dialog";

const STATUS_FILTERS: { label: string; value: DriverStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "LOA", value: "loa" },
  { label: "Inactive", value: "inactive" },
  { label: "Terminated", value: "terminated" },
];

const POSITION_FILTERS: {
  label: string;
  value: DriverPosition | "all";
}[] = [
  { label: "Drivers", value: "driver" },
  { label: "Helpers", value: "helper" },
  { label: "All", value: "all" },
];

/**
 * Unified Drivers + Helpers list. Edit + Add affordances are gated to
 * management — dispatchers see the same data, just without the buttons.
 * RLS in Postgres enforces the same boundary server-side.
 */
export function DriversTable({
  drivers,
  canManage,
}: {
  drivers: DriverListItem[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriverStatus | "all">(
    "active",
  );
  // Default to drivers-only so the daily-use view stays clean; helpers a
  // chip-click away.
  const [positionFilter, setPositionFilter] = useState<
    DriverPosition | "all"
  >("driver");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter((d) => {
      if (positionFilter !== "all" && d.position !== positionFilter)
        return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.full_name.toLowerCase().includes(q) ||
        (d.transporter_id?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [drivers, query, statusFilter, positionFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex items-center h-9 w-full sm:max-w-xs rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search name or transporter ID"
              className="flex-1 min-w-0 px-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mr-2.5 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <DriverFormDialog mode="create" defaultPosition="driver" />
              <DriverFormDialog mode="create" defaultPosition="helper" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex flex-wrap gap-1">
            {POSITION_FILTERS.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant={positionFilter === p.value ? "default" : "outline"}
                onClick={() => setPositionFilter(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <span className="text-muted-foreground text-xs">·</span>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={statusFilter === f.value ? "default" : "outline"}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">
                Transporter ID
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current tier</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="hidden lg:table-cell">
                Last coached
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                Approved vehicles
              </TableHead>
              {canManage && <TableHead className="w-10 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 8 : 7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link
                      href={`/drivers/${d.id}`}
                      className="inline-flex items-center gap-2 py-1 hover:underline"
                    >
                      {d.full_name}
                      {d.position === "helper" && (
                        <span className="text-[10px] uppercase tracking-wider rounded bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 px-1.5 py-0.5">
                          Helper
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                    {d.transporter_id
                      ? `${d.transporter_id.slice(0, 14)}…`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell>
                    <TierBadge tier={d.latest_tier} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {d.latest_overall_score === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      d.latest_overall_score.toFixed(1)
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {d.latest_coached_at ? (
                      <span title={formatSessionDate(d.latest_coached_at)}>
                        {relativeFromNow(d.latest_coached_at)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {d.position === "helper"
                      ? "—"
                      : d.approved_vehicle_types.length === 0
                        ? "—"
                        : d.approved_vehicle_types
                            .map((v) =>
                              v === "standard_parcel"
                                ? "Standard Parcel"
                                : v.toUpperCase(),
                            )
                            .join(", ")}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <DriverFormDialog mode="edit" driver={d} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

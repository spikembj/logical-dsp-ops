"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  daysUntilExpiry,
  type VehicleListItem,
} from "@/lib/queries/fleet-types";
import { VehicleQrButton } from "./vehicle-qr-button";

type FilterValue =
  | "all"
  | "operational"
  | "grounded"
  | "in_shop"
  | "open_issues"
  | "reg_soon";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Operational", value: "operational" },
  { label: "Grounded", value: "grounded" },
  { label: "In shop", value: "in_shop" },
  { label: "Has open issues", value: "open_issues" },
  { label: "Reg expiring", value: "reg_soon" },
];

export function VehiclesTable({ vehicles }: { vehicles: VehicleListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (filter === "operational" && v.operational_status !== "operational")
        return false;
      if (filter === "grounded" && v.operational_status === "operational")
        return false;
      if (filter === "in_shop" && !v.current_shop_name) return false;
      if (filter === "open_issues" && v.open_issues_count === 0) return false;
      if (filter === "reg_soon") {
        const d = daysUntilExpiry(v.registration_expiry_date);
        if (d === null || d > 60) return false;
      }
      if (!q) return true;
      return (
        (v.vehicle_name?.toLowerCase().includes(q) ?? false) ||
        v.vin.toLowerCase().includes(q) ||
        (v.license_plate?.toLowerCase().includes(q) ?? false) ||
        (v.make?.toLowerCase().includes(q) ?? false) ||
        (v.model?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [vehicles, query, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex items-center h-9 w-full sm:max-w-xs rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search name, VIN, plate, make/model"
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
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">VIN</TableHead>
              <TableHead className="hidden md:table-cell">Plate</TableHead>
              <TableHead className="hidden lg:table-cell">
                Make / Model
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Shop</TableHead>
              <TableHead className="hidden lg:table-cell">EOD</TableHead>
              <TableHead className="text-right hidden md:table-cell">
                Issues
              </TableHead>
              <TableHead>Reg</TableHead>
              <TableHead className="text-right">QR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((v) => {
                const days = daysUntilExpiry(v.registration_expiry_date);
                const regChip =
                  days === null
                    ? "bg-muted text-muted-foreground"
                    : days < 30
                      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                      : days < 60
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
                return (
                  <TableRow key={v.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link
                        href={`/fleet/vans/${v.vin}`}
                        className="hover:underline"
                      >
                        {v.vehicle_name || v.vin}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-[11px] text-muted-foreground">
                      {v.vin}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {v.license_plate ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={v.operational_status}
                        manual={v.operational_status_source === "manual"}
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {v.current_shop_name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {v.eod_parking_location ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell tabular-nums">
                      {v.open_issues_count > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {v.open_issues_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
                          regChip,
                        )}
                      >
                        {days === null
                          ? "—"
                          : days < 0
                            ? `${Math.abs(days)}d ago`
                            : `${days}d`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <VehicleQrButton
                        vin={v.vin}
                        name={v.vehicle_name}
                        variant="icon"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  manual,
}: {
  status: VehicleListItem["operational_status"];
  manual: boolean;
}) {
  const map: Record<typeof status, string> = {
    operational:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    grounded: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    ready_for_audit:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
          map[status],
        )}
      >
        {status.replace(/_/g, " ")}
      </span>
      {manual && (
        <span
          className="text-[10px] uppercase tracking-wider rounded px-1 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
          title="Manual override — clear via van detail page to apply Amazon's value"
        >
          manual
        </span>
      )}
    </span>
  );
}

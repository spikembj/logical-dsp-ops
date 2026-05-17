"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  daysUntilExpiry,
  type VehicleRow,
  type VehicleIssueRow,
  type VehiclePartRow,
  type PaveInspectionRow,
} from "@/lib/queries/fleet-types";
import { VehicleOverviewTab } from "./vehicle-overview-tab";
import { VehicleIssuesTab } from "./vehicle-issues-tab";
import { VehiclePartsTab } from "./vehicle-parts-tab";

export function VehicleDetail({
  vehicle,
  issues,
  parts,
  paveInspections,
}: {
  vehicle: VehicleRow;
  issues: VehicleIssueRow[];
  parts: VehiclePartRow[];
  paveInspections: PaveInspectionRow[];
}) {
  const [tab, setTab] = useState<"overview" | "issues" | "parts">("overview");
  const openIssuesCount = issues.filter(
    (i) => i.status === "open" || i.status === "in_shop",
  ).length;
  const openPartsCount = parts.filter(
    (p) => p.status === "needed" || p.status === "ordered" || p.status === "partial",
  ).length;

  const days = daysUntilExpiry(vehicle.registration_expiry_date);

  return (
    <>
      {/* Always-visible status strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge
          status={vehicle.operational_status}
          manual={vehicle.operational_status_source === "manual"}
        />
        {vehicle.ownership_type && (
          <Chip>
            {vehicle.ownership_type.replace("amazon_", "").replace("_", " ")}
          </Chip>
        )}
        {vehicle.service_tier && (
          <Chip className="font-mono text-[10px]">{vehicle.service_tier}</Chip>
        )}
        {vehicle.license_plate && <Chip>{vehicle.license_plate}</Chip>}
        {days !== null && (
          <Chip
            className={cn(
              days < 30
                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                : days < 60
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
            )}
          >
            Reg. {days < 0 ? `expired ${Math.abs(days)}d ago` : `in ${days}d`}
          </Chip>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="issues">
            Issues
            {openIssuesCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 text-[10px] font-medium tabular-nums">
                {openIssuesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="parts">
            Parts
            {openPartsCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 text-[10px] font-medium tabular-nums">
                {openPartsCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <VehicleOverviewTab
            vehicle={vehicle}
            paveInspections={paveInspections}
          />
        </TabsContent>
        <TabsContent value="issues" className="mt-4">
          <VehicleIssuesTab vehicleId={vehicle.id} issues={issues} />
        </TabsContent>
        <TabsContent value="parts" className="mt-4">
          <VehiclePartsTab
            vehicleId={vehicle.id}
            parts={parts}
            issues={issues}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatusBadge({
  status,
  manual,
}: {
  status: VehicleRow["operational_status"];
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
          title="Manual override"
        >
          manual
        </span>
      )}
    </span>
  );
}

function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

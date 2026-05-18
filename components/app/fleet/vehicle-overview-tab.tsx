"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateVehicleLocalFields,
  setVehicleStatusOverride,
  clearVehicleStatusOverride,
  deletePaveInspection,
} from "@/app/actions/fleet";
import {
  formatQuarter,
  type PaveInspectionRow,
  type VehicleRow,
  type VehicleShop,
} from "@/lib/queries/fleet-types";
import { PaveDialog } from "./pave-tile";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: {
  value: VehicleRow["operational_status"];
  label: string;
}[] = [
  { value: "operational", label: "Operational" },
  { value: "grounded", label: "Grounded" },
  { value: "ready_for_audit", label: "Ready for audit" },
];

function getAmazonStatus(
  vehicle: VehicleRow,
): VehicleRow["operational_status"] {
  const raw = (vehicle.raw_data as Record<string, unknown> | null)
    ?.operationalStatus;
  if (typeof raw === "string") {
    const s = raw.trim().toUpperCase();
    if (s === "GROUNDED") return "grounded";
    if (s === "READY_FOR_AUDIT") return "ready_for_audit";
  }
  return "operational";
}

export function VehicleOverviewTab({
  vehicle,
  paveInspections,
  shops,
}: {
  vehicle: VehicleRow;
  paveInspections: PaveInspectionRow[];
  shops: VehicleShop[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shopId, setShopId] = useState<string>(vehicle.current_shop_id ?? "");
  const [eod, setEod] = useState(vehicle.eod_parking_location ?? "");
  const [notes, setNotes] = useState(vehicle.notes ?? "");

  const [statusValue, setStatusValue] = useState<
    VehicleRow["operational_status"]
  >(vehicle.operational_status);
  const [statusNote, setStatusNote] = useState(vehicle.manual_status_note ?? "");

  const isOverridden = vehicle.operational_status_source === "manual";
  const amazonValue = getAmazonStatus(vehicle);
  const statusDiffersFromAmazon =
    isOverridden && amazonValue !== vehicle.operational_status;

  function saveLocal() {
    startTransition(async () => {
      const res = await updateVehicleLocalFields({
        vehicle_id: vehicle.id,
        current_shop_id: shopId || null,
        eod_parking_location: eod || null,
        notes: notes || null,
      });
      if (res.ok) {
        toast.success("Saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function saveStatus() {
    startTransition(async () => {
      const res = await setVehicleStatusOverride({
        vehicle_id: vehicle.id,
        status: statusValue,
        note: statusNote || null,
      });
      if (res.ok) {
        toast.success("Status override saved.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function clearOverride() {
    startTransition(async () => {
      const res = await clearVehicleStatusOverride({ vehicle_id: vehicle.id });
      if (res.ok) {
        toast.success(`Cleared — using Amazon's value (${amazonValue}).`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Locally-editable card */}
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Local notes</h2>
        <p className="text-xs text-muted-foreground -mt-3">
          These fields are yours — never touched by Vehicles imports.
        </p>
        <div className="space-y-2">
          <Label htmlFor="shop">Current shop / location</Label>
          <select
            id="shop"
            value={shopId}
            onChange={(e) => setShopId(e.currentTarget.value)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">— None —</option>
            {shops
              .filter((s) => s.active || s.id === vehicle.current_shop_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {!s.active ? " (inactive)" : ""}
                </option>
              ))}
          </select>
          <p className="text-[10px] text-muted-foreground">
            Manage the list at <a href="/admin/shops" className="underline-offset-2 hover:underline">Manage → Shops</a>.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="eod">EOD parking spot</Label>
          <Input
            id="eod"
            value={eod}
            onChange={(e) => setEod(e.currentTarget.value)}
            placeholder="e.g. Row C-12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="Anything we want to remember about this van"
            rows={3}
          />
        </div>
        <Button onClick={saveLocal} disabled={pending}>
          <Save className="mr-1.5 h-4 w-4" />
          {pending ? "Saving..." : "Save"}
        </Button>
      </section>

      {/* Operational status override card */}
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Operational status</h2>
        <p className="text-xs text-muted-foreground -mt-3">
          Source: {isOverridden ? "manual override" : "Amazon import"}.
        </p>

        {statusDiffersFromAmazon && (
          <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs">
            Amazon currently reports{" "}
            <strong className="font-medium">
              {amazonValue.replace(/_/g, " ")}
            </strong>
            . You've overridden to{" "}
            <strong>
              {vehicle.operational_status.replace(/_/g, " ")}
            </strong>
            .{" "}
            <button
              type="button"
              onClick={clearOverride}
              className="underline underline-offset-2 hover:text-foreground"
              disabled={pending}
            >
              Use Amazon's value
            </button>
          </div>
        )}

        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={statusValue}
            onValueChange={(v) =>
              setStatusValue(v as VehicleRow["operational_status"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status-note">Reason (optional)</Label>
          <Textarea
            id="status-note"
            value={statusNote}
            onChange={(e) => setStatusNote(e.currentTarget.value)}
            placeholder="Why are we overriding the status?"
            rows={2}
          />
        </div>

        {vehicle.status_reason_message && (
          <p className="text-xs text-muted-foreground">
            Amazon's last note:{" "}
            <span className="text-foreground/80">
              {vehicle.status_reason_message}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveStatus} disabled={pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? "Saving..." : "Save override"}
          </Button>
          {isOverridden && (
            <Button
              variant="outline"
              onClick={clearOverride}
              disabled={pending}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Use Amazon's value
            </Button>
          )}
        </div>
      </section>

      {/* Read-only Amazon card (full width) */}
      <section className="rounded-xl border bg-card p-4 lg:col-span-2">
        <h2 className="text-sm font-semibold mb-3">Amazon record</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6 text-sm">
          <Field label="VIN" value={vehicle.vin} mono />
          <Field label="Vehicle name" value={vehicle.vehicle_name} />
          <Field label="License plate" value={vehicle.license_plate} />
          <Field
            label="Make / Model"
            value={[vehicle.make, vehicle.model].filter(Boolean).join(" ") || null}
          />
          <Field label="Sub-model" value={vehicle.sub_model} />
          <Field label="Year" value={vehicle.year?.toString() ?? null} />
          <Field label="Service tier" value={vehicle.service_tier} mono />
          <Field label="Service type" value={vehicle.service_type} />
          <Field
            label="Ownership"
            value={
              vehicle.ownership_type
                ? vehicle.ownership_type
                    .replace("amazon_", "Amazon ")
                    .replace("_", " ")
                : null
            }
          />
          <Field label="Provider" value={vehicle.vehicle_provider} />
          <Field
            label="Reg. expiry"
            value={
              vehicle.registration_expiry_date
                ? format(
                    parseISO(vehicle.registration_expiry_date),
                    "MMM d, yyyy",
                  )
                : null
            }
          />
          <Field
            label="Registered state"
            value={vehicle.registered_state}
          />
          <Field label="Station" value={vehicle.station_code} />
        </dl>
      </section>

      {/* PAVE history (last 4 inspections) */}
      <section className="rounded-xl border bg-card p-4 lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">PAVE history</h2>
          <PaveDialog
            vehicleId={vehicle.id}
            vehicleName={vehicle.vehicle_name || vehicle.vin}
          />
        </div>
        {paveInspections.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No PAVE inspections recorded yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {paveInspections.slice(0, 4).map((p) => (
              <PaveHistoryRow key={p.id} inspection={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaveHistoryRow({ inspection }: { inspection: PaveInspectionRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const acceptable = inspection.score >= 3;

  function handleDelete() {
    if (!confirm("Delete this PAVE record? This can't be undone.")) return;
    startTransition(async () => {
      const res = await deletePaveInspection({ inspection_id: inspection.id });
      if (res.ok) {
        toast.success("Deleted.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <li className="px-3 py-2 flex items-center gap-3 text-sm">
      <span className="text-xs text-muted-foreground tabular-nums min-w-16">
        {formatQuarter(inspection.quarter, inspection.year)}
      </span>
      <span className="text-foreground/80 tabular-nums">
        {format(parseISO(inspection.completed_date), "MMM d, yyyy")}
      </span>
      <span
        className={cn(
          "ml-auto text-xs font-medium tabular-nums rounded px-1.5 py-0.5",
          acceptable
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
        )}
      >
        Score {inspection.score}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive transition-colors"
        aria-label="Delete PAVE record"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-[12px]" : ""}>
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

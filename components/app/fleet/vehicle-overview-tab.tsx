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
} from "@/app/actions/fleet";
import type { VehicleRow } from "@/lib/queries/fleet-types";

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

export function VehicleOverviewTab({ vehicle }: { vehicle: VehicleRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shop, setShop] = useState(vehicle.current_shop_location ?? "");
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
        current_shop_location: shop || null,
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
          <Label htmlFor="shop">Current shop</Label>
          <Input
            id="shop"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            placeholder="e.g. Crash Champions"
          />
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
    </div>
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

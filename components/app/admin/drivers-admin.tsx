"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/lib/format/badges";
import { createDriver, updateDriver } from "@/app/actions/drivers";
import type {
  DriverPosition,
  DriverRow,
  DriverStatus,
  VehicleType,
} from "@/lib/types/database";

const STATUS_OPTIONS: { label: string; value: DriverStatus }[] = [
  { label: "Active", value: "active" },
  { label: "LOA", value: "loa" },
  { label: "Inactive", value: "inactive" },
  { label: "Terminated", value: "terminated" },
];
const VEHICLE_OPTIONS: { label: string; value: VehicleType }[] = [
  { label: "CDV", value: "cdv" },
  { label: "EDV", value: "edv" },
  { label: "Standard Parcel", value: "standard_parcel" },
];

const POSITION_OPTIONS: { label: string; value: DriverPosition }[] = [
  { label: "Driver", value: "driver" },
  { label: "Helper", value: "helper" },
];
const STATUS_FILTERS: { label: string; value: DriverStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "LOA", value: "loa" },
  { label: "Inactive", value: "inactive" },
  { label: "Terminated", value: "terminated" },
];

export function DriversAdmin({ drivers }: { drivers: DriverRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriverStatus | "all">(
    "active",
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.full_name.toLowerCase().includes(q) ||
        (d.transporter_id?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [drivers, query, statusFilter]);

  return (
    <div className="space-y-3">
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
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <DriverFormDialog mode="create" />
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
              <TableHead className="hidden md:table-cell">Hire date</TableHead>
              <TableHead className="hidden lg:table-cell">
                Approved vehicles
              </TableHead>
              <TableHead className="text-right w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {d.full_name}
                      {d.position === "helper" && (
                        <span className="text-[10px] uppercase tracking-wider rounded bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 px-1.5 py-0.5">
                          Helper
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                    {d.transporter_id ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {d.hire_date ?? "—"}
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
                  <TableCell className="text-right">
                    <DriverFormDialog mode="edit" driver={d} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type CreateProps = { mode: "create"; driver?: undefined };
type EditProps = { mode: "edit"; driver: DriverRow };
type Props = CreateProps | EditProps;

function DriverFormDialog(props: Props) {
  const isEdit = props.mode === "edit";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const initial = isEdit
    ? {
        full_name: props.driver.full_name,
        transporter_id: props.driver.transporter_id ?? "",
        status: props.driver.status,
        position: props.driver.position,
        hire_date: props.driver.hire_date ?? "",
        approved_vehicle_types: props.driver.approved_vehicle_types,
        notes: props.driver.notes ?? "",
      }
    : {
        full_name: "",
        transporter_id: "",
        status: "active" as DriverStatus,
        position: "driver" as DriverPosition,
        hire_date: "",
        approved_vehicle_types: [] as VehicleType[],
        notes: "",
      };

  const [fullName, setFullName] = useState(initial.full_name);
  const [tid, setTid] = useState(initial.transporter_id);
  const [status, setStatus] = useState<DriverStatus>(initial.status);
  const [position, setPosition] = useState<DriverPosition>(initial.position);
  const [hireDate, setHireDate] = useState(initial.hire_date);
  const [vehicles, setVehicles] = useState<VehicleType[]>(
    initial.approved_vehicle_types,
  );
  const [notes, setNotes] = useState(initial.notes);

  function reset() {
    setFullName(initial.full_name);
    setTid(initial.transporter_id);
    setStatus(initial.status);
    setPosition(initial.position);
    setHireDate(initial.hire_date);
    setVehicles(initial.approved_vehicle_types);
    setNotes(initial.notes);
  }

  function toggleVehicle(v: VehicleType, checked: boolean) {
    setVehicles((prev) =>
      checked ? [...new Set([...prev, v])] : prev.filter((x) => x !== v),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    startTransition(async () => {
      const payload = {
        full_name: fullName.trim(),
        transporter_id: tid.trim(),
        status,
        position,
        hire_date: hireDate.trim(),
        // Helpers don't drive — force vehicles empty regardless of UI state.
        approved_vehicle_types: position === "helper" ? [] : vehicles,
        notes: notes.trim(),
      };
      const res = isEdit
        ? await updateDriver({ driver_id: props.driver.id, ...payload })
        : await createDriver(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Driver updated." : "Driver added.");
      if (!isEdit) reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        className={
          isEdit
            ? "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            : "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        }
      >
        {isEdit ? (
          <>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" /> Add driver
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit driver" : "Add driver"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Change any field. Status flips between active / LOA / inactive / terminated."
              : "Create a new driver row. Transporter ID is optional — the next scorecard import will populate it via name match."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.currentTarget.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="transporter_id">Transporter ID</Label>
              <Input
                id="transporter_id"
                placeholder="A1B2C3..."
                value={tid}
                onChange={(e) => setTid(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) =>
                  setStatus(e.currentTarget.value as DriverStatus)
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <select
                id="position"
                value={position}
                onChange={(e) =>
                  setPosition(e.currentTarget.value as DriverPosition)
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {POSITION_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hire_date">Hire date</Label>
              <Input
                id="hire_date"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.currentTarget.value)}
              />
            </div>
          </div>
          {position === "driver" ? (
            <div className="space-y-2">
              <Label>Approved vehicles</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {VEHICLE_OPTIONS.map((v) => (
                  <label
                    key={v.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={vehicles.includes(v.value)}
                      onCheckedChange={(c) =>
                        toggleVehicle(v.value, Boolean(c))
                      }
                    />
                    {v.label}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Helpers ride along — vehicle approvals don&rsquo;t apply.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : isEdit
                  ? "Save changes"
                  : "Add driver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
import {
  copyFromPreviousDay,
  createRosterEntry,
  deleteRosterEntry,
  updateRosterEntry,
} from "@/app/actions/daily-ops";
import {
  formatShowTime,
  type DailyRosterEntry,
  type WaveTime,
} from "@/lib/queries/daily-ops-types";
import { formatSessionDate } from "@/lib/format/dates";

interface DriverPick {
  id: string;
  full_name: string;
}
interface VehiclePick {
  id: string;
  vehicle_name: string;
  vin: string;
}

export function DailyRoster({
  date,
  roster,
  waves,
  drivers,
  vehicles,
  canWrite,
  prevDate,
}: {
  date: string;
  roster: DailyRosterEntry[];
  waves: WaveTime[];
  drivers: DriverPick[];
  vehicles: VehiclePick[];
  canWrite: boolean;
  prevDate: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // For the picker UX: a driver/van already on today's roster can still
  // be selected from the SAME row's dialog (when editing) but should be
  // hidden from OTHER rows' add/edit dialogs to prevent the obvious
  // conflict. Edit dialogs handle this by passing currentDriverId /
  // currentVehicleId; the dialog allows those even if in the rostered
  // set.
  const rosteredDriverIds = useMemo(
    () => new Set(roster.map((r) => r.driver_id)),
    [roster],
  );
  const rosteredVehicleIds = useMemo(
    () => new Set(roster.map((r) => r.vehicle_id)),
    [roster],
  );

  function handleCopyPrev() {
    if (!prevDate) {
      toast.error("No prior roster found to copy from.");
      return;
    }
    if (
      !confirm(
        `Copy roster from ${formatSessionDate(prevDate)} into ${formatSessionDate(date)}? Existing rows on this day stay; conflicts are skipped.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await copyFromPreviousDay({ target_date: date });
      if (!res.ok) {
        toast.error(res.error ?? "Copy failed.");
        return;
      }
      const bits: string[] = [`copied ${res.copied_count} from ${res.source_date}`];
      if (res.skipped_van_grounded)
        bits.push(`${res.skipped_van_grounded} vans now grounded`);
      if (res.skipped_driver_inactive)
        bits.push(`${res.skipped_driver_inactive} drivers inactive`);
      if (res.skipped_conflict)
        bits.push(`${res.skipped_conflict} already on roster`);
      toast.success(bits.join(" · "));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Sorted by wave then van. Operational vans only.
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {prevDate && roster.length === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPrev}
                disabled={pending}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Copy from {formatSessionDate(prevDate)}
              </Button>
            )}
            <RosterDialog
              mode="create"
              date={date}
              waves={waves}
              drivers={drivers}
              vehicles={vehicles}
              rosteredDriverIds={rosteredDriverIds}
              rosteredVehicleIds={rosteredVehicleIds}
            />
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Wave</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Van</TableHead>
              <TableHead>Notes</TableHead>
              {canWrite && <TableHead className="text-right w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canWrite ? 5 : 4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No assignments yet for {formatSessionDate(date)}.
                  {canWrite && prevDate && (
                    <>
                      {" "}
                      Use <strong>Copy from {formatSessionDate(prevDate)}</strong>{" "}
                      above to seed, or <strong>Add</strong> rows manually.
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              roster.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-sm tabular-nums">
                    <span className="font-medium">{r.wave}</span>{" "}
                    <span className="text-muted-foreground">
                      · {formatShowTime(r.show_time)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/drivers/${r.driver_id}`}
                      className="hover:underline font-medium"
                    >
                      {r.driver_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/fleet/vans/${r.vehicle_vin}`}
                      className="hover:underline"
                    >
                      {r.vehicle_name ?? r.vehicle_vin}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.notes ?? <span className="text-muted-foreground/60">—</span>}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RosterDialog
                        mode="edit"
                        date={date}
                        entry={r}
                        waves={waves}
                        drivers={drivers}
                        vehicles={vehicles}
                        rosteredDriverIds={rosteredDriverIds}
                        rosteredVehicleIds={rosteredVehicleIds}
                      />
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

type DialogProps =
  | {
      mode: "create";
      date: string;
      entry?: undefined;
      waves: WaveTime[];
      drivers: DriverPick[];
      vehicles: VehiclePick[];
      rosteredDriverIds: Set<string>;
      rosteredVehicleIds: Set<string>;
    }
  | {
      mode: "edit";
      date: string;
      entry: DailyRosterEntry;
      waves: WaveTime[];
      drivers: DriverPick[];
      vehicles: VehiclePick[];
      rosteredDriverIds: Set<string>;
      rosteredVehicleIds: Set<string>;
    };

function RosterDialog(props: DialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isEdit = props.mode === "edit";

  const [driverId, setDriverId] = useState(
    isEdit ? props.entry.driver_id : "",
  );
  const [vehicleId, setVehicleId] = useState(
    isEdit ? props.entry.vehicle_id : "",
  );
  const [wave, setWave] = useState<string>(
    isEdit ? String(props.entry.wave) : props.waves[0]?.wave.toString() ?? "1",
  );
  const [notes, setNotes] = useState(isEdit ? props.entry.notes ?? "" : "");
  const [driverQuery, setDriverQuery] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");

  const availableDrivers = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    return props.drivers.filter((d) => {
      // Hide drivers already on today's roster EXCEPT the one assigned
      // to this row in edit mode.
      if (
        props.rosteredDriverIds.has(d.id) &&
        !(isEdit && d.id === props.entry.driver_id)
      )
        return false;
      if (!q) return true;
      return d.full_name.toLowerCase().includes(q);
    });
  }, [props.drivers, props.rosteredDriverIds, driverQuery, isEdit, props]);

  const availableVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase();
    return props.vehicles.filter((v) => {
      if (
        props.rosteredVehicleIds.has(v.id) &&
        !(isEdit && v.id === props.entry.vehicle_id)
      )
        return false;
      if (!q) return true;
      return (
        v.vehicle_name.toLowerCase().includes(q) ||
        v.vin.toLowerCase().includes(q)
      );
    });
  }, [props.vehicles, props.rosteredVehicleIds, vehicleQuery, isEdit, props]);

  function reset() {
    if (isEdit) {
      setDriverId(props.entry.driver_id);
      setVehicleId(props.entry.vehicle_id);
      setWave(String(props.entry.wave));
      setNotes(props.entry.notes ?? "");
    } else {
      setDriverId("");
      setVehicleId("");
      setWave(props.waves[0]?.wave.toString() ?? "1");
      setNotes("");
    }
    setDriverQuery("");
    setVehicleQuery("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!driverId || !vehicleId) {
      toast.error("Pick a driver and a van.");
      return;
    }
    startTransition(async () => {
      const payload = {
        driver_id: driverId,
        vehicle_id: vehicleId,
        wave: Number(wave),
        notes: notes.trim() || null,
      };
      const res = isEdit
        ? await updateRosterEntry({ entry_id: props.entry.id, ...payload })
        : await createRosterEntry({ date: props.date, ...payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Updated." : "Added.");
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!isEdit) return;
    if (!confirm(`Remove ${props.entry.driver_name} from the roster?`)) return;
    startTransition(async () => {
      const res = await deleteRosterEntry({ entry_id: props.entry.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Removed.");
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
            ? "inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            : "inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
        }
        aria-label={isEdit ? "Edit assignment" : "Add assignment"}
      >
        {isEdit ? <Pencil className="h-3.5 w-3.5" /> : <><Plus className="h-4 w-4" /> Add</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit assignment" : "Add to roster"}
          </DialogTitle>
          <DialogDescription>
            {formatSessionDate(props.date)} · Operational vans only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Wave */}
          <div className="space-y-2">
            <Label>Wave</Label>
            <Select
              value={wave}
              onValueChange={(v) => setWave(v ?? wave)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.waves.map((w) => (
                  <SelectItem key={w.wave} value={String(w.wave)}>
                    Wave {w.wave} · {formatShowTime(w.show_time)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Driver picker (searchable) */}
          <div className="space-y-2">
            <Label>Driver</Label>
            <div className="flex items-center h-9 w-full rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.currentTarget.value)}
                placeholder="Search drivers"
                className="flex-1 min-w-0 px-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {availableDrivers.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No matches.
                </p>
              ) : (
                <ul>
                  {availableDrivers.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setDriverId(d.id)}
                        className={
                          "w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40 " +
                          (driverId === d.id ? "bg-muted font-medium" : "")
                        }
                      >
                        {d.full_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Vehicle picker (searchable) */}
          <div className="space-y-2">
            <Label>Van</Label>
            <div className="flex items-center h-9 w-full rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={vehicleQuery}
                onChange={(e) => setVehicleQuery(e.currentTarget.value)}
                placeholder="Search van name or VIN"
                className="flex-1 min-w-0 px-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {availableVehicles.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No matches.
                </p>
              ) : (
                <ul>
                  {availableVehicles.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setVehicleId(v.id)}
                        className={
                          "w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40 " +
                          (vehicleId === v.id ? "bg-muted font-medium" : "")
                        }
                      >
                        {v.vehicle_name}{" "}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {v.vin.slice(0, 14)}…
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="roster-notes">Notes (optional)</Label>
            <Textarea
              id="roster-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </div>

          <DialogFooter>
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={pending}
                className="mr-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

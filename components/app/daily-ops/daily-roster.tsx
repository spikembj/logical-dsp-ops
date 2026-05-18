"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * Van-first roster: one row per operational van, dispatcher fills in
 * driver name (autocomplete) + wave (dropdown) + optional notes.
 * Mirrors the dispatcher's existing spreadsheet workflow.
 *
 * Auto-save behavior: whenever a row has both a valid driver AND a
 * wave, changes commit on field blur (or immediately on wave change).
 * Clearing the driver deletes the row. Race-safe via simple per-row
 * pending state — the user can keep typing while a save is in flight.
 */
export function DailyRoster({
  date,
  roster,
  waves,
  drivers,
  vehicles,
  canWrite,
  prevDate,
  lastDriverByVehicle,
}: {
  date: string;
  roster: DailyRosterEntry[];
  waves: WaveTime[];
  drivers: DriverPick[];
  vehicles: VehiclePick[];
  canWrite: boolean;
  prevDate: string | null;
  /** vehicle_id → most-recently-assigned driver_id (from any prior day). */
  lastDriverByVehicle: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Name → driver_id lookup for the datalist autocomplete. Build once;
  // dedupe on exact name (case-sensitive — Amazon names are usually
  // consistent in casing).
  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers) {
      if (!m.has(d.full_name)) m.set(d.full_name, d.id);
    }
    return m;
  }, [drivers]);
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivers) m.set(d.id, d.full_name);
    return m;
  }, [drivers]);

  // Index existing roster entries by vehicle_id for quick row lookup.
  const entryByVehicle = useMemo(() => {
    const m = new Map<string, DailyRosterEntry>();
    for (const r of roster) m.set(r.vehicle_id, r);
    return m;
  }, [roster]);

  // Track which driver_ids are already on the roster so we can warn the
  // user before they double-assign someone.
  const rosteredDriverIds = useMemo(
    () => new Set(roster.map((r) => r.driver_id)),
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
      const bits: string[] = [
        `copied ${res.copied_count} from ${res.source_date}`,
      ];
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

  const assignedCount = roster.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {vehicles.length} operational vans · {assignedCount} assigned · Type
          a name to autocomplete; changes save automatically.
        </div>
        {canWrite && prevDate && assignedCount === 0 && (
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
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Van</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="w-40">Wave</TableHead>
              <TableHead>Notes</TableHead>
              {canWrite && <TableHead className="w-10 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canWrite ? 5 : 4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No operational vans. Import the Vehicles xlsx (or clear
                  manual grounding overrides in Fleet) so vans appear here.
                </TableCell>
              </TableRow>
            ) : (
              vehicles.map((v) => (
                <VanRow
                  key={v.id}
                  date={date}
                  vehicle={v}
                  entry={entryByVehicle.get(v.id) ?? null}
                  waves={waves}
                  drivers={drivers}
                  nameToId={nameToId}
                  idToName={idToName}
                  rosteredDriverIds={rosteredDriverIds}
                  canWrite={canWrite}
                  suggestedDriverId={lastDriverByVehicle[v.id] ?? null}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Single shared datalist for every row's driver input. */}
      <datalist id="dr-driver-options">
        {drivers.map((d) => (
          <option key={d.id} value={d.full_name} />
        ))}
      </datalist>
    </div>
  );
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function VanRow({
  date,
  vehicle,
  entry,
  waves,
  drivers: _drivers,
  nameToId,
  idToName,
  rosteredDriverIds,
  canWrite,
  suggestedDriverId,
}: {
  date: string;
  vehicle: VehiclePick;
  entry: DailyRosterEntry | null;
  waves: WaveTime[];
  drivers: DriverPick[];
  nameToId: Map<string, string>;
  idToName: Map<string, string>;
  rosteredDriverIds: Set<string>;
  canWrite: boolean;
  suggestedDriverId: string | null;
}) {
  const router = useRouter();
  const [entryId, setEntryId] = useState<string | null>(entry?.id ?? null);

  // Prefill rule: if no entry today AND there's a prior driver for this
  // van AND that driver isn't already assigned to a different van today,
  // suggest them. User just needs to pick a wave to commit. They can
  // overwrite by typing a different name or clear with the X. Waves are
  // NOT remembered — dispatcher told us to forget the waves.
  const initialDriverName = (() => {
    if (entry?.driver_id) {
      return idToName.get(entry.driver_id) ?? "";
    }
    if (suggestedDriverId && !rosteredDriverIds.has(suggestedDriverId)) {
      return idToName.get(suggestedDriverId) ?? "";
    }
    return "";
  })();

  const [driverName, setDriverName] = useState(initialDriverName);
  const [wave, setWave] = useState<string>(
    entry?.wave !== undefined ? String(entry.wave) : "",
  );
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Cache the last successfully-saved state so we can diff before
  // firing redundant saves. Using a ref so updates don't re-render.
  const savedRef = useRef({
    driverId: entry?.driver_id ?? null,
    wave: entry?.wave !== undefined ? String(entry.wave) : "",
    notes: entry?.notes ?? "",
  });

  const driverId = nameToId.get(driverName.trim()) ?? null;

  const hasMatchedDriver = driverName.trim().length === 0 || driverId !== null;
  const isValid =
    driverId !== null && wave !== "" && wave !== "—" && hasMatchedDriver;

  /**
   * Sync the row to the server. Triggered on every relevant change
   * (driver picked / wave picked / notes blurred). Decides
   * insert/update/delete based on current state vs saved state.
   */
  async function sync() {
    if (!canWrite) return;
    const saved = savedRef.current;

    // CASE: row had an entry and driver is now empty → delete.
    if (entryId && driverName.trim() === "") {
      setStatus("saving");
      const res = await deleteRosterEntry({ entry_id: entryId });
      if (!res.ok) {
        setStatus("error");
        toast.error(res.error);
        return;
      }
      setEntryId(null);
      savedRef.current = { driverId: null, wave: "", notes: "" };
      setStatus("saved");
      setWave("");
      setNotes("");
      window.setTimeout(() => setStatus("idle"), 1200);
      router.refresh();
      return;
    }

    // If the driver text exists but doesn't match anyone, hold.
    if (driverName.trim() !== "" && !driverId) {
      setStatus("dirty");
      return;
    }
    // If we need both driver + wave but don't have wave yet, hold.
    if (driverId && !wave) {
      setStatus("dirty");
      return;
    }
    // No driver picked → nothing to do.
    if (!driverId) {
      setStatus("idle");
      return;
    }

    // Diff against saved state.
    const cleanNotes = notes.trim();
    const cleanSavedNotes = saved.notes.trim();
    const unchanged =
      driverId === saved.driverId &&
      wave === saved.wave &&
      cleanNotes === cleanSavedNotes;
    if (unchanged) {
      setStatus("idle");
      return;
    }

    // Conflict pre-check: assigning a driver who's already on a
    // DIFFERENT van's row today.
    if (
      driverId !== saved.driverId &&
      rosteredDriverIds.has(driverId)
    ) {
      setStatus("error");
      toast.error(
        `${driverName.trim()} is already on today's roster — clear the other van first.`,
      );
      return;
    }

    setStatus("saving");
    if (entryId) {
      const res = await updateRosterEntry({
        entry_id: entryId,
        driver_id: driverId,
        vehicle_id: vehicle.id,
        wave: Number(wave),
        notes: cleanNotes || null,
      });
      if (!res.ok) {
        setStatus("error");
        toast.error(res.error);
        return;
      }
    } else {
      const res = await createRosterEntry({
        date,
        driver_id: driverId,
        vehicle_id: vehicle.id,
        wave: Number(wave),
        notes: cleanNotes || null,
      });
      if (!res.ok) {
        setStatus("error");
        toast.error(res.error);
        return;
      }
      setEntryId(res.entry_id);
    }

    savedRef.current = { driverId, wave, notes: cleanNotes };
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1200);
    router.refresh();
  }

  // Wave changes commit immediately (it's a discrete value, not typing).
  useEffect(() => {
    if (status === "saving") return;
    // Skip the initial render — savedRef matches state, sync() will no-op.
    const saved = savedRef.current;
    if (saved.wave === wave) return;
    void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave]);

  // Mark dirty on driver/notes typing for the visual indicator.
  useEffect(() => {
    const saved = savedRef.current;
    const cleanNotes = notes.trim();
    const changed =
      driverId !== saved.driverId ||
      notes.trim() !== saved.notes.trim();
    if (changed && status !== "saving") {
      setStatus(driverId && wave ? "dirty" : "dirty");
    } else if (!changed && status === "dirty") {
      setStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverName, notes]);

  function handleClear() {
    if (!entryId) {
      // Nothing to delete — just reset local state.
      setDriverName("");
      setWave("");
      setNotes("");
      setStatus("idle");
      return;
    }
    if (!confirm(`Remove ${driverName.trim()} from ${vehicle.vehicle_name}?`))
      return;
    setDriverName("");
    // sync() will detect entryId + empty driver → delete.
    void sync();
  }

  const showDriverWarning = driverName.trim() !== "" && !driverId;

  return (
    <TableRow className={status === "saving" ? "opacity-70" : undefined}>
      <TableCell className="font-medium">
        <Link
          href={`/fleet/vans/${vehicle.vin}`}
          className="hover:underline"
        >
          {vehicle.vehicle_name}
        </Link>
      </TableCell>
      <TableCell>
        <Input
          type="text"
          list="dr-driver-options"
          value={driverName}
          onChange={(e) => setDriverName(e.currentTarget.value)}
          onBlur={() => void sync()}
          placeholder="Type a driver name…"
          disabled={!canWrite}
          aria-invalid={showDriverWarning}
          className={
            showDriverWarning
              ? "border-amber-500 focus-visible:border-amber-500"
              : undefined
          }
        />
        {showDriverWarning && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
            No driver named &ldquo;{driverName.trim()}&rdquo; — pick from the
            list.
          </p>
        )}
      </TableCell>
      <TableCell>
        <select
          value={wave}
          onChange={(e) => setWave(e.currentTarget.value)}
          disabled={!canWrite || !driverId}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <option value="">—</option>
          {waves.map((w) => (
            <option key={w.wave} value={String(w.wave)}>
              {w.wave} · {formatShowTime(w.show_time)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          onBlur={() => void sync()}
          placeholder=""
          disabled={!canWrite || !driverId}
        />
      </TableCell>
      {canWrite && (
        <TableCell className="text-right">
          <RowStatusBadge status={status} hasEntry={!!entryId} />
          {entryId && (
            <button
              type="button"
              onClick={handleClear}
              disabled={status === "saving"}
              aria-label="Clear row"
              className="ml-1 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function RowStatusBadge({
  status,
  hasEntry,
}: {
  status: SaveStatus;
  hasEntry: boolean;
}) {
  if (status === "saving")
    return (
      <span className="text-[10px] text-muted-foreground tabular-nums">
        saving…
      </span>
    );
  if (status === "saved")
    return <Check className="inline-block h-3.5 w-3.5 text-emerald-600" />;
  if (status === "dirty")
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-amber-500"
        title="Unsaved changes"
      />
    );
  if (status === "error")
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-red-500"
        title="Save failed"
      />
    );
  return hasEntry ? (
    <span
      className="inline-block h-2 w-2 rounded-full bg-emerald-500/60"
      title="Saved"
    />
  ) : null;
}

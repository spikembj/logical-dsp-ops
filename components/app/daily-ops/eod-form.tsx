"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ClipboardCheck, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createEodVanNote,
  deleteEodVanNote,
  upsertDailyReport,
} from "@/app/actions/daily-ops";
import type {
  DailyReportRow,
  EodVanNote,
} from "@/lib/queries/daily-ops-types";

interface IdLabel {
  id: string;
  label: string;
}
interface VehiclePick extends IdLabel {
  vin: string;
  grounded: boolean;
}

const SAVE_DEBOUNCE_MS = 600;

/**
 * EOD report form. All fields auto-save on change (debounced for text
 * inputs to avoid hammering the server on every keystroke).
 *
 * Layout: route counts + safety + capacity in a grid of small cards;
 * dispatchers + late drivers as picker lists below; injuries +
 * general notes as textareas; per-van notes get their own card that
 * also surfaces existing notes for the day so the dispatcher can
 * delete misfires.
 *
 * A duties-checklist placeholder card sits at the bottom — it will
 * surface "X/Y duties done today" once Pass E lands; for now it's a
 * heads-up that the feature is coming.
 */
export function EodForm({
  date,
  report,
  eodNotes,
  dispatchers,
  drivers,
  vehicles,
  canWrite,
}: {
  date: string;
  report: DailyReportRow | null;
  eodNotes: EodVanNote[];
  dispatchers: IdLabel[];
  drivers: IdLabel[];
  vehicles: VehiclePick[];
  canWrite: boolean;
}) {
  const router = useRouter();

  // Numbers come back as `number | null` — track as strings in state so
  // empty input renders cleanly and parseInt handles validation.
  const [routesTotal, setRoutesTotal] = useState(strFrom(report?.routes_total));
  const [routesReduced, setRoutesReduced] = useState(
    strFrom(report?.routes_reduced),
  );
  const [routesRecycled, setRoutesRecycled] = useState(
    strFrom(report?.routes_recycled),
  );
  const [routesAdHocs, setRoutesAdHocs] = useState(
    strFrom(report?.routes_ad_hocs),
  );
  const [cameraHits, setCameraHits] = useState(strFrom(report?.camera_hits));
  const [opVansNext, setOpVansNext] = useState(
    strFrom(report?.operational_vans_next_day),
  );
  const [opPhonesNext, setOpPhonesNext] = useState(
    strFrom(report?.operational_phones_next_day),
  );
  const [injuries, setInjuries] = useState(report?.injuries_incidents ?? "");
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [dispatcherIds, setDispatcherIds] = useState<string[]>(
    report?.dispatchers ?? [],
  );
  const [lateDriverIds, setLateDriverIds] = useState<string[]>(
    report?.drivers_after_8pm ?? [],
  );

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<number | null>(null);

  const collected = useMemo(
    () => ({
      routes_total: intOrNull(routesTotal),
      routes_reduced: intOrNull(routesReduced),
      routes_recycled: intOrNull(routesRecycled),
      routes_ad_hocs: intOrNull(routesAdHocs),
      camera_hits: intOrNull(cameraHits),
      operational_vans_next_day: intOrNull(opVansNext),
      operational_phones_next_day: intOrNull(opPhonesNext),
      injuries_incidents: injuries.trim() || null,
      notes: notes.trim() || null,
      dispatchers: dispatcherIds,
      drivers_after_8pm: lateDriverIds,
    }),
    [
      routesTotal,
      routesReduced,
      routesRecycled,
      routesAdHocs,
      cameraHits,
      opVansNext,
      opPhonesNext,
      injuries,
      notes,
      dispatcherIds,
      lateDriverIds,
    ],
  );

  function scheduleSave(immediate = false) {
    if (!canWrite) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const delay = immediate ? 0 : SAVE_DEBOUNCE_MS;
    timerRef.current = window.setTimeout(async () => {
      setSaving(true);
      const res = await upsertDailyReport({ date, ...collected });
      setSaving(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSavedAt(new Date());
    }, delay);
  }

  // Save whenever any tracked field changes. Debounced for text/number
  // inputs (typing); immediate for arrays (picker chips).
  useEffect(() => {
    scheduleSave();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Status strip — spans full width */}
      <div className="lg:col-span-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {saving
            ? "Saving…"
            : savedAt
              ? `Saved at ${format(savedAt, "h:mm:ss a")}`
              : "Edit any field — autosaves."}
        </span>
        {!canWrite && (
          <span className="text-amber-700 dark:text-amber-400">
            Read-only
          </span>
        )}
      </div>

      {/* Route counts */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Routes</h2>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            id="rt"
            label="Total"
            value={routesTotal}
            onChange={setRoutesTotal}
            disabled={!canWrite}
          />
          <NumField
            id="rr"
            label="Reduced"
            value={routesReduced}
            onChange={setRoutesReduced}
            disabled={!canWrite}
          />
          <NumField
            id="rc"
            label="Recycled"
            value={routesRecycled}
            onChange={setRoutesRecycled}
            disabled={!canWrite}
          />
          <NumField
            id="ra"
            label="Ad-hocs"
            value={routesAdHocs}
            onChange={setRoutesAdHocs}
            disabled={!canWrite}
          />
        </div>
      </section>

      {/* Safety + capacity */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Safety + next-day capacity</h2>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            id="ch"
            label="Camera hits"
            value={cameraHits}
            onChange={setCameraHits}
            disabled={!canWrite}
          />
          <div />
          <NumField
            id="vn"
            label="Operational vans tomorrow"
            value={opVansNext}
            onChange={setOpVansNext}
            disabled={!canWrite}
          />
          <NumField
            id="pn"
            label="Operational phones tomorrow"
            value={opPhonesNext}
            onChange={setOpPhonesNext}
            disabled={!canWrite}
          />
        </div>
      </section>

      {/* Dispatchers on shift — checklist */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Dispatchers on shift</h2>
        {dispatchers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No users have a dispatcher or management role.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {dispatchers.map((d) => (
              <li key={d.id}>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={dispatcherIds.includes(d.id)}
                    disabled={!canWrite}
                    onCheckedChange={(c) =>
                      setDispatcherIds((prev) =>
                        c
                          ? [...new Set([...prev, d.id])]
                          : prev.filter((x) => x !== d.id),
                      )
                    }
                  />
                  {d.label}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Drivers after 8pm — searchable add */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Drivers on shift after 8pm</h2>
        <ChipPicker
          options={drivers}
          selectedIds={lateDriverIds}
          setSelectedIds={setLateDriverIds}
          placeholder="Search drivers"
          disabled={!canWrite}
        />
      </section>

      {/* Injuries / incidents */}
      <section className="rounded-xl border bg-card p-4 space-y-2 lg:col-span-2">
        <Label htmlFor="injuries" className="text-sm font-semibold">
          Injuries / incidents
        </Label>
        <Textarea
          id="injuries"
          rows={3}
          value={injuries}
          onChange={(e) => setInjuries(e.currentTarget.value)}
          placeholder="Anything that happened on the lot or on the road today."
          disabled={!canWrite}
        />
      </section>

      {/* Per-van notes */}
      <section className="rounded-xl border bg-card p-4 space-y-3 lg:col-span-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Per-van notes</h2>
          <span className="text-xs text-muted-foreground">
            Each note logs an open issue on the van so it shows up in Fleet.
          </span>
        </div>
        <EodVanNotesPanel
          date={date}
          notes={eodNotes}
          vehicles={vehicles}
          canWrite={canWrite}
        />
      </section>

      {/* General notes */}
      <section className="rounded-xl border bg-card p-4 space-y-2 lg:col-span-2">
        <Label htmlFor="notes" className="text-sm font-semibold">
          General notes
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="Anything else worth recording for the next dispatcher."
          disabled={!canWrite}
        />
      </section>

      {/* Duties checklist placeholder */}
      <section className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-2 lg:col-span-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Duties checklist</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Coming in Pass E — once the duties checklist surface ships, this
          card will show <strong>X of Y</strong> items completed for today,
          with a per-shift breakdown (Preload out / Load out / Post / RTS /
          Closing). For now: track duties in the spreadsheet.
        </p>
      </section>
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={disabled}
        className="tabular-nums"
      />
    </div>
  );
}

function ChipPicker({
  options,
  selectedIds,
  setSelectedIds,
  placeholder,
  disabled,
}: {
  options: IdLabel[];
  selectedIds: string[];
  setSelectedIds: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const idToLabel = useMemo(
    () => new Map(options.map((o) => [o.id, o.label])),
    [options],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter(
        (o) => !selectedIds.includes(o.id) && o.label.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [options, selectedIds, query]);

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {idToLabel.get(id) ?? "(unknown)"}
              {!disabled && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(selectedIds.filter((x) => x !== id))
                  }
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <div className="flex items-center h-9 w-full rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={placeholder}
              className="flex-1 min-w-0 px-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {filtered.length > 0 && (
            <ul className="rounded-md border max-h-40 overflow-y-auto">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds([...selectedIds, o.id]);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function EodVanNotesPanel({
  date,
  notes,
  vehicles,
  canWrite,
}: {
  date: string;
  notes: EodVanNote[];
  vehicles: VehiclePick[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [description, setDescription] = useState("");

  const idToVehicle = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );
  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase();
    if (!q) return [];
    return vehicles
      .filter(
        (v) =>
          v.label.toLowerCase().includes(q) ||
          v.vin.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [vehicles, vehicleQuery]);

  function handleAdd() {
    if (!vehicleId) {
      toast.error("Pick a van.");
      return;
    }
    if (!description.trim()) {
      toast.error("Type a note.");
      return;
    }
    startTransition(async () => {
      const res = await createEodVanNote({
        date,
        vehicle_id: vehicleId,
        description: description.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Note added.");
      setVehicleId("");
      setVehicleQuery("");
      setDescription("");
      router.refresh();
    });
  }

  function handleDelete(noteId: string, name: string) {
    if (!confirm(`Delete the note about ${name}?`)) return;
    startTransition(async () => {
      const res = await deleteEodVanNote({ issue_id: noteId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  const selectedVehicle = vehicleId ? idToVehicle.get(vehicleId) : null;

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label className="text-xs font-semibold">Add note</Label>
          {selectedVehicle ? (
            <div className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-sm">
              <span>
                <strong>{selectedVehicle.label}</strong>
                {selectedVehicle.grounded && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    grounded
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setVehicleId("");
                  setVehicleQuery("");
                }}
                aria-label="Change van"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
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
              {filteredVehicles.length > 0 && (
                <ul className="rounded-md border max-h-40 overflow-y-auto">
                  {filteredVehicles.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setVehicleId(v.id);
                          setVehicleQuery("");
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40 flex items-center justify-between"
                      >
                        <span>
                          {v.label}{" "}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {v.vin.slice(0, 14)}…
                          </span>
                        </span>
                        {v.grounded && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            grounded
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="e.g. Cargo lights won't turn on, nail in pass. rear tire"
          />
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pending || !vehicleId || !description.trim()}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add note
          </Button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No per-van notes logged for {date}.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {notes.map((n) => (
            <li
              key={n.id}
              className="px-3 py-2 flex items-center gap-3"
            >
              <Link
                href={`/fleet/vans/${n.vehicle_vin}`}
                className="text-sm font-medium hover:underline shrink-0 min-w-32"
              >
                {n.vehicle_name}
              </Link>
              <span className="flex-1 text-sm">{n.description}</span>
              <span className="text-[10px] text-muted-foreground">
                {format(parseISO(n.created_at), "MMM d")}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => handleDelete(n.id, n.vehicle_name)}
                  disabled={pending}
                  aria-label="Delete note"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function strFrom(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}
function intOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

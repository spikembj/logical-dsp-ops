"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, X } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createVehiclePart,
  updateVehiclePart,
  deleteVehiclePart,
} from "@/app/actions/fleet";
import type {
  VehicleIssueRow,
  VehiclePartRow,
  VehiclePartStatus,
} from "@/lib/queries/fleet-types";
import { cn } from "@/lib/utils";

type Filter = "open" | "all";

const STATUSES: { value: VehiclePartStatus; label: string }[] = [
  { value: "needed", label: "Needed" },
  { value: "ordered", label: "Ordered" },
  { value: "partial", label: "Partial" },
  { value: "received", label: "Received" },
  { value: "installed", label: "Installed" },
  { value: "returned", label: "Returned" },
];

const OPEN_STATUSES: VehiclePartStatus[] = ["needed", "ordered", "partial"];

function deriveStatus(
  ordered: number,
  received: number,
  installed: number,
  current: VehiclePartStatus,
): VehiclePartStatus {
  // `returned` is sticky — never auto-derive away from it
  if (current === "returned") return "returned";
  if (ordered === 0) return "needed";
  if (received === 0) return "ordered";
  if (installed >= ordered && installed > 0) return "installed";
  if (received >= ordered && installed < received) return "received";
  return "partial";
}

export function VehiclePartsTab({
  vehicleId,
  parts,
  issues,
}: {
  vehicleId: string;
  parts: VehiclePartRow[];
  issues: VehicleIssueRow[];
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const filtered = parts.filter((p) =>
    filter === "open" ? OPEN_STATUSES.includes(p.status) : true,
  );

  const issueById = new Map(issues.map((i) => [i.id, i]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["open", "all"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "open" ? "Open" : "All"}
            </Button>
          ))}
        </div>
        <PartDialog vehicleId={vehicleId} mode="create" issues={issues} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {filter === "open" ? "No parts on order or needed." : "No parts logged."}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {filtered.map((p) => (
            <PartRow
              key={p.id}
              part={p}
              vehicleId={vehicleId}
              linkedIssue={p.issue_id ? issueById.get(p.issue_id) : undefined}
              issues={issues}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PartRow({
  part,
  vehicleId,
  linkedIssue,
  issues,
}: {
  part: VehiclePartRow;
  vehicleId: string;
  linkedIssue: VehicleIssueRow | undefined;
  issues: VehicleIssueRow[];
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm">{part.part_name}</span>
            {part.part_number && (
              <span className="font-mono text-[11px] text-muted-foreground">
                #{part.part_number}
              </span>
            )}
            <StatusBadge status={part.status} />
            {linkedIssue && (
              <span
                className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground"
                title={linkedIssue.description}
              >
                for: {truncate(linkedIssue.description, 30)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            Ordered {part.quantity_ordered} · Received{" "}
            {part.quantity_received} · Installed {part.quantity_installed}
            {part.vendor && <> · Vendor: {part.vendor}</>}
            {part.cost !== null && <> · ${part.cost.toFixed(2)}</>}
            {part.ordered_at && (
              <>
                {" "}· Ordered {format(parseISO(part.ordered_at), "MMM d")}
              </>
            )}
          </p>
          {part.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {part.notes}
            </p>
          )}
        </div>
        <PartDialog
          vehicleId={vehicleId}
          mode="edit"
          part={part}
          issues={issues}
        />
      </div>
    </li>
  );
}

function PartDialog({
  vehicleId,
  mode,
  part,
  issues,
}: {
  vehicleId: string;
  mode: "create" | "edit";
  part?: VehiclePartRow;
  issues: VehicleIssueRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [partName, setPartName] = useState(part?.part_name ?? "");
  const [partNumber, setPartNumber] = useState(part?.part_number ?? "");
  const [issueId, setIssueId] = useState<string>(part?.issue_id ?? "none");
  const [quantityOrdered, setQuantityOrdered] = useState(
    part?.quantity_ordered ?? 1,
  );
  const [quantityReceived, setQuantityReceived] = useState(
    part?.quantity_received ?? 0,
  );
  const [quantityInstalled, setQuantityInstalled] = useState(
    part?.quantity_installed ?? 0,
  );
  const [status, setStatus] = useState<VehiclePartStatus>(
    part?.status ?? "needed",
  );
  const [vendor, setVendor] = useState(part?.vendor ?? "");
  const [costStr, setCostStr] = useState(part?.cost?.toFixed(2) ?? "");
  const [notes, setNotes] = useState(part?.notes ?? "");

  // Auto-derive status whenever quantities change (unless user explicitly
  // picked 'returned' — handled by deriveStatus).
  function setQty(
    field: "ordered" | "received" | "installed",
    v: number,
  ) {
    const safe = Math.max(0, Math.floor(v));
    let nextOrdered = quantityOrdered;
    let nextReceived = quantityReceived;
    let nextInstalled = quantityInstalled;
    if (field === "ordered") nextOrdered = safe;
    if (field === "received")
      nextReceived = Math.min(safe, nextOrdered);
    if (field === "installed")
      nextInstalled = Math.min(safe, nextReceived);
    setQuantityOrdered(nextOrdered);
    setQuantityReceived(nextReceived);
    setQuantityInstalled(nextInstalled);
    setStatus(
      deriveStatus(nextOrdered, nextReceived, nextInstalled, status),
    );
  }

  function handleSave() {
    const cost = costStr.trim() ? parseFloat(costStr) : null;
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createVehiclePart({
              vehicle_id: vehicleId,
              issue_id: issueId === "none" ? null : issueId,
              part_name: partName,
              part_number: partNumber || null,
              quantity_ordered: quantityOrdered,
              status,
              vendor: vendor || null,
              cost: cost ?? undefined,
              ordered_at:
                quantityOrdered > 0 ? new Date().toISOString() : undefined,
              notes: notes || null,
            })
          : await updateVehiclePart({
              part_id: part!.id,
              quantity_ordered: quantityOrdered,
              quantity_received: quantityReceived,
              quantity_installed: quantityInstalled,
              status,
              notes: notes || null,
            });
      if (res.ok) {
        toast.success(mode === "create" ? "Part added." : "Part updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDelete() {
    if (!part) return;
    if (!confirm(`Delete part "${part.part_name}"? This can't be undone.`))
      return;
    startTransition(async () => {
      const res = await deleteVehiclePart({ part_id: part.id });
      if (res.ok) {
        toast.success("Deleted.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          mode === "create"
            ? "inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            : "inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
        )}
        aria-label={mode === "create" ? "Order part" : "Edit part"}
      >
        {mode === "create" ? (
          <>
            <Plus className="h-4 w-4" /> Order part
          </>
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Order / log part" : "Edit part"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "create" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="part-name">Part name</Label>
                <Input
                  id="part-name"
                  value={partName}
                  onChange={(e) => setPartName(e.currentTarget.value)}
                  placeholder="Brake pads, side mirror, etc."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="part-number">Part number (optional)</Label>
                  <Input
                    id="part-number"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.currentTarget.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>For issue (optional)</Label>
                  <Select
                    value={issueId}
                    onValueChange={(v) => setIssueId(v ?? "none")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not linked —</SelectItem>
                      {issues
                        .filter(
                          (i) =>
                            i.status === "open" ||
                            i.status === "in_shop",
                        )
                        .map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {truncate(i.description, 40)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Ordered</Label>
              <Input
                type="number"
                min={0}
                value={quantityOrdered}
                onChange={(e) =>
                  setQty("ordered", Number(e.currentTarget.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Received</Label>
              <Input
                type="number"
                min={0}
                max={quantityOrdered}
                value={quantityReceived}
                onChange={(e) =>
                  setQty("received", Number(e.currentTarget.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Installed</Label>
              <Input
                type="number"
                min={0}
                max={quantityReceived}
                value={quantityInstalled}
                onChange={(e) =>
                  setQty("installed", Number(e.currentTarget.value))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as VehiclePartStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Auto-derives from the quantities — override here for{" "}
              <em>Returned</em> or other manual states.
            </p>
          </div>

          {mode === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor (optional)</Label>
                <Input
                  id="vendor"
                  value={vendor}
                  onChange={(e) => setVendor(e.currentTarget.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost (optional)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={costStr}
                  onChange={(e) => setCostStr(e.currentTarget.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="part-notes">Notes</Label>
            <Textarea
              id="part-notes"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          {mode === "edit" && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={pending}
              className="mr-auto text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={pending || (mode === "create" && !partName.trim())}
          >
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: VehiclePartStatus }) {
  const styles: Record<VehiclePartStatus, string> = {
    needed:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    ordered:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    partial:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    received:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
    installed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    returned: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

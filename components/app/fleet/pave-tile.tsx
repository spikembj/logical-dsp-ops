"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createPaveInspection } from "@/app/actions/fleet";
import {
  bucketFor,
  formatQuarter,
  type PaveQuarterStatus,
  type PaveStatusBucket,
  type VehicleListItem,
} from "@/lib/queries/fleet-types";
import { cn } from "@/lib/utils";

interface PaveRow {
  vehicle: VehicleListItem;
  status: PaveQuarterStatus;
  bucket: PaveStatusBucket;
}

/**
 * Bottom-of-dashboard PAVE tracking surface. Collapsed by default — the
 * summary line shows quarter status counts. Expanded view is the full
 * per-van roster with inline "Mark complete" + score picker.
 *
 * Lives at the bottom of /fleet because it's only used heavily during one
 * week per quarter; the rest of the time the summary is enough.
 */
export function PaveTile({
  quarter,
  year,
  rows,
}: {
  quarter: number;
  year: number;
  rows: PaveRow[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"todo" | "all">("todo");

  const counts = {
    done: 0,
    needs_reinspect: 0,
    not_done: 0,
  };
  for (const r of rows) counts[r.bucket]++;

  const visible = rows.filter((r) =>
    filter === "todo" ? r.bucket !== "done" : true,
  );

  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h2 className="text-sm font-semibold">PAVE</h2>
          <span className="text-xs text-muted-foreground">
            {formatQuarter(quarter, year)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <BucketChip kind="done" count={counts.done} total={rows.length} />
          {counts.needs_reinspect > 0 && (
            <BucketChip kind="needs_reinspect" count={counts.needs_reinspect} />
          )}
          {counts.not_done > 0 && (
            <BucketChip kind="not_done" count={counts.not_done} />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(["todo", "all"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                >
                  {f === "todo" ? "To do" : "All"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Quarterly Amazon-mandated inspection · score 3-4 acceptable
            </p>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {filter === "todo"
                ? "✓ All vans complete this quarter."
                : "No vans on file."}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {visible.map((r) => (
                <PaveRowItem key={r.vehicle.id} row={r} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function BucketChip({
  kind,
  count,
  total,
}: {
  kind: PaveStatusBucket;
  count: number;
  total?: number;
}) {
  const styles: Record<PaveStatusBucket, string> = {
    done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    needs_reinspect:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    not_done:
      "bg-muted text-muted-foreground",
  };
  const labels: Record<PaveStatusBucket, string> = {
    done: "done",
    needs_reinspect: "re-inspect",
    not_done: "not done",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 font-medium", styles[kind])}>
      {total !== undefined ? `${count}/${total}` : count} {labels[kind]}
    </span>
  );
}

function PaveRowItem({ row }: { row: PaveRow }) {
  const { vehicle, status, bucket } = row;
  return (
    <li className="px-3 py-2 flex items-center gap-3">
      <Link
        href={`/fleet/vans/${vehicle.vin}`}
        className="text-sm font-medium hover:underline min-w-32"
      >
        {vehicle.vehicle_name || vehicle.vin}
      </Link>
      <div className="flex-1 min-w-0 text-xs text-muted-foreground">
        {status.latestScore !== null ? (
          <>
            Score{" "}
            <strong
              className={cn(
                "font-medium tabular-nums",
                status.latestScore >= 3
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              {status.latestScore}
            </strong>
            {" · "}
            {status.latestDate && format(parseISO(status.latestDate), "MMM d")}
            {status.attemptCount > 1 && (
              <> · {status.attemptCount} attempts</>
            )}
          </>
        ) : (
          "Not done this quarter"
        )}
      </div>
      <PaveDialog
        vehicleId={vehicle.id}
        vehicleName={vehicle.vehicle_name || vehicle.vin}
        triggerLabel={bucket === "needs_reinspect" ? "Re-inspect" : "Record"}
      />
    </li>
  );
}

export function PaveDialog({
  vehicleId,
  vehicleName,
  triggerLabel = "Record PAVE",
}: {
  vehicleId: string;
  vehicleName: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [score, setScore] = useState<"1" | "2" | "3" | "4">("4");

  function handleSave() {
    startTransition(async () => {
      const res = await createPaveInspection({
        vehicle_id: vehicleId,
        completed_date: date,
        score: Number(score) as 1 | 2 | 3 | 4,
      });
      if (res.ok) {
        toast.success(`PAVE recorded for ${vehicleName}.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border bg-card hover:bg-muted text-xs transition-colors">
        <Plus className="h-3 w-3" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record PAVE — {vehicleName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pave-date">Completed date</Label>
            <Input
              id="pave-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Score</Label>
            <Select
              value={score}
              onValueChange={(v) => setScore((v ?? "4") as "1" | "2" | "3" | "4")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 (acceptable)</SelectItem>
                <SelectItem value="3">3 (acceptable)</SelectItem>
                <SelectItem value="2">2 (re-inspect)</SelectItem>
                <SelectItem value="1">1 (re-inspect)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Vans need a 3 or 4 to be acceptable. A score of 1 or 2 means we
              need to re-inspect before the quarter ends.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

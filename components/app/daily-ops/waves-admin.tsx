"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { upsertWaveTime, deleteWaveTime } from "@/app/actions/daily-ops";
import {
  formatShowTime,
  type WaveTime,
} from "@/lib/queries/daily-ops-types";

export function WavesAdmin({ waves }: { waves: WaveTime[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <WaveDialog mode="create" existingWaves={waves.map((w) => w.wave)} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Wave</TableHead>
              <TableHead>Show time</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {waves.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No wave times yet.
                </TableCell>
              </TableRow>
            ) : (
              waves.map((w) => (
                <WaveRow key={w.wave} wave={w} existingWaves={waves.map((x) => x.wave)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WaveRow({
  wave,
  existingWaves,
}: {
  wave: WaveTime;
  existingWaves: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete wave ${wave.wave}? If any historical roster rows reference it, the delete will fail — mark it inactive instead.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteWaveTime({ wave: wave.wave });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Wave ${wave.wave} deleted.`);
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">{wave.wave}</TableCell>
      <TableCell className="tabular-nums">
        {formatShowTime(wave.show_time)}
      </TableCell>
      <TableCell>
        {wave.active ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Inactive</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-1">
          <WaveDialog mode="edit" wave={wave} existingWaves={existingWaves} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            aria-label="Delete wave"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | { mode: "create"; wave?: undefined; existingWaves: number[] }
  | { mode: "edit"; wave: WaveTime; existingWaves: number[] };

function WaveDialog(props: DialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isEdit = props.mode === "edit";

  const [waveNum, setWaveNum] = useState<string>(
    isEdit ? String(props.wave.wave) : "",
  );
  const [time, setTime] = useState<string>(
    isEdit ? formatShowTime(props.wave.show_time) : "",
  );
  const [active, setActive] = useState<boolean>(
    isEdit ? props.wave.active : true,
  );

  function reset() {
    if (isEdit) {
      setWaveNum(String(props.wave.wave));
      setTime(formatShowTime(props.wave.show_time));
      setActive(props.wave.active);
    } else {
      setWaveNum("");
      setTime("");
      setActive(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(waveNum, 10);
    if (Number.isNaN(n) || n < 1 || n > 20) {
      toast.error("Wave number must be between 1 and 20.");
      return;
    }
    if (!isEdit && props.existingWaves.includes(n)) {
      toast.error(`Wave ${n} already exists — edit it instead.`);
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      toast.error("Time must be HH:MM (24-hour).");
      return;
    }
    startTransition(async () => {
      const res = await upsertWaveTime({
        wave: n,
        show_time: time,
        active,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Updated." : `Wave ${n} added.`);
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
        aria-label={isEdit ? `Edit wave ${props.wave.wave}` : "Add wave"}
      >
        {isEdit ? <span className="text-xs">Edit</span> : <><Plus className="h-4 w-4" /> Add wave</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit wave ${props.wave.wave}` : "Add wave"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wave-num">Wave number</Label>
              <Input
                id="wave-num"
                type="number"
                min={1}
                max={20}
                required
                value={waveNum}
                onChange={(e) => setWaveNum(e.currentTarget.value)}
                disabled={isEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="show-time">Show time</Label>
              <Input
                id="show-time"
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.currentTarget.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={active}
              onCheckedChange={(c) => setActive(Boolean(c))}
            />
            Active (show in the roster picker)
          </label>
          <DialogFooter>
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

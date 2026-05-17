"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface VehicleTileItem {
  vin: string;
  name: string;
  /** Right-side metadata, e.g. "Reg. expires May 28" or "OPERATIONAL · 3 open" */
  hint?: string;
}

interface Props {
  label: string;
  /** The big number on the tile. */
  count: number;
  /** Subtle hint under the tile (always shown). */
  tileHint?: string;
  /** Tile accent — drives color of the count. */
  accent?: "default" | "warn" | "good";
  /** Title shown in the popover. */
  dialogTitle: string;
  dialogDescription?: string;
  vehicles: VehicleTileItem[];
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "",
  warn: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
};

/**
 * Fleet-flavored stat tile. Same shape as the Performance dashboard's
 * ThresholdTile but for vehicles — clickable when count > 0, opens a
 * popover listing vans with per-row link to the van detail page.
 */
export function VehicleTile({
  label,
  count,
  tileHint,
  accent = "default",
  dialogTitle,
  dialogDescription,
  vehicles,
}: Props) {
  const [open, setOpen] = useState(false);
  const clickable = vehicles.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "rounded-xl border bg-card text-card-foreground p-4 text-left w-full transition-colors",
          clickable ? "hover:bg-muted/40" : "cursor-default",
        )}
        disabled={!clickable}
      >
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              ACCENT[accent],
            )}
          >
            {count}
          </div>
          {clickable && (
            <span className="text-xs text-muted-foreground">tap to view</span>
          )}
        </div>
        {tileHint && (
          <div className="mt-0.5 text-xs text-muted-foreground">{tileHint}</div>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {dialogDescription && (
            <DialogDescription>{dialogDescription}</DialogDescription>
          )}
        </DialogHeader>
        {vehicles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing here. ✓
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y rounded-md border">
            {vehicles.map((v) => (
              <li
                key={v.vin}
                className="px-3 py-2 flex items-center justify-between gap-3"
              >
                <Link
                  href={`/fleet/vans/${v.vin}`}
                  className="text-sm font-medium hover:underline"
                  onClick={() => setOpen(false)}
                >
                  {v.name}
                </Link>
                {v.hint && (
                  <span className="text-xs text-muted-foreground">
                    {v.hint}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

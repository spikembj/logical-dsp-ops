"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { VehicleTileItem } from "./vehicle-tile";

interface Side {
  label: string;
  count: number;
  accent: "good" | "warn" | "default";
  dialogTitle: string;
  dialogDescription?: string;
  vehicles: VehicleTileItem[];
}

const ACCENT: Record<Side["accent"], string> = {
  default: "",
  warn: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
};

/**
 * Two stat numbers in a single tile, each independently clickable
 * (each opens its own popover listing the matching vans). Used for
 * Operational + Grounded so they sit visually together — they're the
 * two sides of the same status coin and looking at one usually means
 * thinking about the other.
 */
export function DualVehicleTile({ left, right }: { left: Side; right: Side }) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground overflow-hidden grid grid-cols-2 divide-x">
      <SideButton side={left} />
      <SideButton side={right} />
    </div>
  );
}

function SideButton({ side }: { side: Side }) {
  const [open, setOpen] = useState(false);
  const clickable = side.vehicles.length > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "p-4 text-left w-full transition-colors",
          clickable ? "hover:bg-muted/40" : "cursor-default",
        )}
        disabled={!clickable}
      >
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {side.label}
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              ACCENT[side.accent],
            )}
          >
            {side.count}
          </div>
          {clickable && (
            <span className="text-xs text-muted-foreground">tap to view</span>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{side.dialogTitle}</DialogTitle>
          {side.dialogDescription && (
            <DialogDescription>{side.dialogDescription}</DialogDescription>
          )}
        </DialogHeader>
        {side.vehicles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing here. ✓
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y rounded-md border">
            {side.vehicles.map((v) => (
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

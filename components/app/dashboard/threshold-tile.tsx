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

interface DriverRowSafety {
  driver_id: string;
  full_name: string;
  impacting_count: number;
  non_impacting_count: number;
}

interface DriverRowQuality {
  driver_id: string;
  full_name: string;
  issues: string[];
}

interface BaseProps {
  label: string;
  hint?: string;
  /** Title shown in the popover dialog. */
  dialogTitle: string;
  dialogDescription?: string;
}

interface SafetyProps extends BaseProps {
  kind: "safety";
  drivers: DriverRowSafety[];
}

interface QualityProps extends BaseProps {
  kind: "quality";
  drivers: DriverRowQuality[];
}

type Props = SafetyProps | QualityProps;

/**
 * Tile that shows a count and, on click, opens a dialog listing the
 * driver names + their per-driver breach detail with links to each
 * driver profile. Used for stat tile #4 on both Safety and Quality
 * dashboards — exposes the "who specifically is causing this" detail
 * without cluttering the main dashboard layout.
 */
export function ThresholdTile(props: Props) {
  const [open, setOpen] = useState(false);
  const count = props.drivers.length;
  const accent =
    count > 0
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="rounded-xl border bg-card text-card-foreground p-4 text-left hover:bg-muted/40 transition-colors w-full"
        disabled={count === 0}
      >
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {props.label}
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <div className={cn("text-2xl font-semibold tabular-nums", accent)}>
            {count}
          </div>
          {count > 0 && (
            <span className="text-xs text-muted-foreground">tap to view</span>
          )}
        </div>
        {props.hint && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {props.hint}
          </div>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.dialogTitle}</DialogTitle>
          {props.dialogDescription && (
            <DialogDescription>{props.dialogDescription}</DialogDescription>
          )}
        </DialogHeader>
        {count === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nobody on the list. 🎉
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y rounded-md border">
            {props.kind === "safety"
              ? props.drivers.map((d) => (
                  <li key={d.driver_id} className="px-3 py-2">
                    <Link
                      href={`/drivers/${d.driver_id}`}
                      className="text-sm font-medium hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {d.full_name}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.impacting_count > 0 && (
                        <span>
                          {d.impacting_count} impacting
                        </span>
                      )}
                      {d.impacting_count > 0 &&
                        d.non_impacting_count > 0 &&
                        " · "}
                      {d.non_impacting_count > 0 && (
                        <span>
                          {d.non_impacting_count} non-impacting
                        </span>
                      )}
                    </div>
                  </li>
                ))
              : props.drivers.map((d) => (
                  <li key={d.driver_id} className="px-3 py-2">
                    <Link
                      href={`/drivers/${d.driver_id}`}
                      className="text-sm font-medium hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {d.full_name}
                    </Link>
                    <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                      {d.issues.map((iss, i) => (
                        <li key={i}>• {iss}</li>
                      ))}
                    </ul>
                  </li>
                ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

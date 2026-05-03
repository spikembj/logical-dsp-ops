import { cn } from "@/lib/utils";

interface Side {
  label: string;
  value: string | number;
  accent?: "default" | "warn" | "good";
}

const ACCENT: Record<NonNullable<Side["accent"]>, string> = {
  default: "",
  warn: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
};

/**
 * Two equally-sized values inside one tile, separated by a thin divider.
 * Used when both values carry the same weight (e.g. Safety vs Quality
 * needs-coaching counts).
 */
export function SplitStatTile({
  label,
  hint,
  left,
  right,
}: {
  label: string;
  hint?: string;
  left: Side;
  right: Side;
}) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-2 divide-x">
        <SidePane side={left} />
        <SidePane side={right} className="pl-4" />
      </div>
      {hint && (
        <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function SidePane({
  side,
  className,
}: {
  side: Side;
  className?: string;
}) {
  return (
    <div className={cn("pr-4", className)}>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          ACCENT[side.accent ?? "default"],
        )}
      >
        {side.value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {side.label}
      </div>
    </div>
  );
}

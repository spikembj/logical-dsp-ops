import { cn } from "@/lib/utils";

interface SecondaryValue {
  label: string;
  value: string | number;
}

interface Props {
  label: string;
  value: string | number;
  /** Optional second value, rendered smaller next to the primary. */
  secondary?: SecondaryValue;
  hint?: string;
  accent?: "default" | "warn" | "good";
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "",
  warn: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
};

export function StatTile({
  label,
  value,
  secondary,
  hint,
  accent = "default",
}: Props) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground p-4">
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
          {value}
        </div>
        {secondary && (
          <div className="text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {secondary.value}
            </span>{" "}
            {secondary.label}
          </div>
        )}
      </div>
      {hint && (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

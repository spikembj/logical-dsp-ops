import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "warn" | "good";
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "",
  warn: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
};

export function StatTile({ label, value, hint, accent = "default" }: Props) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", ACCENT[accent])}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

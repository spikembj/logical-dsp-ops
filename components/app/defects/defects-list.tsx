"use client";

import { useMemo, useState } from "react";
import { Package, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatSessionDate } from "@/lib/format/dates";
import type { DefectItem } from "@/lib/queries/defects";
import { cn } from "@/lib/utils";

type Kind = "all" | "concession" | "cdf";
const FILTERS: { label: string; value: Kind }[] = [
  { label: "All", value: "all" },
  { label: "Concessions", value: "concession" },
  { label: "CDF Negative", value: "cdf" },
];

export function DefectsList({ items }: { items: DefectItem[] }) {
  const [filter, setFilter] = useState<Kind>("all");
  const [dsbOnly, setDsbOnly] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filter !== "all" && i.kind !== filter) return false;
      if (dsbOnly && !(i.kind === "concession" && i.impacts_dsb)) return false;
      return true;
    });
  }, [items, filter, dsbOnly]);

  const counts = {
    concession: items.filter((i) => i.kind === "concession").length,
    cdf: items.filter((i) => i.kind === "cdf").length,
    dsb: items.filter((i) => i.kind === "concession" && i.impacts_dsb).length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1 text-xs rounded-md transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-70 tabular-nums">
                {f.value === "all"
                  ? counts.concession + counts.cdf
                  : f.value === "concession"
                    ? counts.concession
                    : counts.cdf}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={dsbOnly}
            onChange={(e) => setDsbOnly(e.currentTarget.checked)}
            className="size-4"
          />
          <span>DSB-impacting only ({counts.dsb})</span>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length === 0
          ? "Nothing to show."
          : `${filtered.length} ${filtered.length === 1 ? "row" : "rows"}, newest first.`}
      </p>

      {filtered.length > 0 && (
        <ul className="rounded-xl border bg-card divide-y">
          {filtered.map((i) => (
            <li key={`${i.kind}-${i.id}`} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {i.kind === "concession" ? (
                    <>
                      <Package className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                      <span className="font-medium">Concession</span>
                    </>
                  ) : (
                    <>
                      <MessageSquareWarning className="h-3.5 w-3.5 text-rose-700 dark:text-rose-400" />
                      <span className="font-medium">CDF negative</span>
                    </>
                  )}
                </span>
                <time
                  dateTime={i.date}
                  className="text-xs text-muted-foreground"
                >
                  {formatSessionDate(i.date.slice(0, 10))}
                </time>
                {i.kind === "concession" && i.impacts_dsb && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400"
                  >
                    Impacts DSB
                  </Badge>
                )}
                {i.kind === "concession" && i.delivery_type && (
                  <span className="text-xs text-muted-foreground">
                    {i.delivery_type}
                  </span>
                )}
                <code className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {i.tracking_id}
                </code>
              </div>

              {i.kind === "concession" && (i.defect_types?.length ?? 0) > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {i.defect_types!.map((d) => (
                    <Badge
                      key={d}
                      variant="outline"
                      className="text-[10px] font-normal"
                    >
                      {d}
                    </Badge>
                  ))}
                </div>
              )}

              {i.kind === "cdf" && (
                <>
                  {(i.feedback_types?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {i.feedback_types!.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {i.feedback_details && i.feedback_details.trim() !== "" && (
                    <p className="mt-2 text-sm italic text-foreground/80 whitespace-pre-line">
                      “{i.feedback_details.trim()}”
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

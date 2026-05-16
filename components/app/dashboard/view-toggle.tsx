"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardView = "safety" | "quality";

/**
 * Pill segmented control that swaps the dashboard between Safety and
 * Quality views. State lives in the URL (?view=quality) so it's
 * shareable, back-button-friendly, and survives page refresh.
 */
export function ViewToggle({ current }: { current: DashboardView }) {
  const router = useRouter();
  const params = useSearchParams();

  function setView(view: DashboardView) {
    const next = new URLSearchParams(params.toString());
    if (view === "quality") next.delete("view"); // default = quality, keep URL clean
    else next.set("view", "safety");
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setView("safety")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm transition-colors",
          current === "safety"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={current === "safety"}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        Safety
      </button>
      <button
        type="button"
        onClick={() => setView("quality")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm transition-colors",
          current === "quality"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={current === "quality"}
      >
        <FileWarning className="h-3.5 w-3.5" />
        Quality
      </button>
    </div>
  );
}

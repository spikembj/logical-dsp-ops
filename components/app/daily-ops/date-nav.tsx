"use client";

import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/lib/format/dates";

/**
 * Prev / Today / Next + date picker for the Daily Ops page. Pushes new
 * `?date=…` params via `router.push` so the parent server component
 * re-renders with the new day's data.
 */
export function DateNav({ date }: { date: string }) {
  const router = useRouter();
  const today = todayIso();
  const isToday = date === today;

  function goTo(iso: string) {
    if (iso === today) router.push("/daily");
    else router.push(`/daily?date=${iso}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => goTo(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))}
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </Button>
      <Button
        type="button"
        variant={isToday ? "default" : "outline"}
        size="sm"
        onClick={() => goTo(today)}
      >
        Today
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => goTo(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) goTo(v);
        }}
        className="h-9 w-auto"
      />
    </div>
  );
}

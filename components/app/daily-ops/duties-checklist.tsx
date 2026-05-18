"use client";

import { useOptimistic, useTransition, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleDutyCompletion } from "@/app/actions/daily-ops";
import {
  DUTIES_GROUP_LABELS,
  DUTIES_GROUP_ORDER,
  type DutiesCadence,
  type DutiesItemWithCompletion,
} from "@/lib/queries/daily-ops-types";

/**
 * Checklist UI. Items are grouped by `group_label` for daily; weekly
 * and monthly are flat (single section). Clicking a checkbox toggles
 * the duties_completion row via the action with optimistic UI so the
 * checkmark feels instant — server confirms in the background.
 */
export function DutiesChecklist({
  cadence,
  periodKey,
  items,
  canWrite,
}: {
  cadence: DutiesCadence;
  periodKey: string;
  items: DutiesItemWithCompletion[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startSavingTransition] = useTransition();

  // Optimistic state — flips the local "checked" flag instantly,
  // server action confirms in the background.
  type OptimisticChange = { itemId: string; done: boolean };
  const [optimistic, applyOptimistic] = useOptimistic<
    Map<string, boolean>,
    OptimisticChange
  >(
    new Map(items.map((i) => [i.id, !!i.completion])),
    (state, change) => {
      const next = new Map(state);
      next.set(change.itemId, change.done);
      return next;
    },
  );

  function handleToggle(itemId: string, done: boolean) {
    if (!canWrite) return;
    startTransition(() => {
      applyOptimistic({ itemId, done });
    });
    startSavingTransition(async () => {
      const res = await toggleDutyCompletion({
        template_item_id: itemId,
        period_key: periodKey,
        done,
      });
      if (!res.ok) {
        toast.error(res.error);
        // Optimistic state rolls back automatically when the transition
        // resolves with the new server state via router.refresh.
      }
      router.refresh();
    });
  }

  // Group items by group_label. For weekly/monthly there's no group
  // (everything ends up in a single "All" bucket).
  if (cadence === "daily") {
    return (
      <div className="space-y-4">
        {DUTIES_GROUP_ORDER.map((g) => {
          const groupItems = items.filter((i) => i.group_label === g);
          if (groupItems.length === 0) return null;
          const groupDone = groupItems.filter((i) =>
            optimistic.get(i.id),
          ).length;
          return (
            <section
              key={g}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <header className="px-4 py-2 border-b bg-muted/30 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">
                  {DUTIES_GROUP_LABELS[g]}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {groupDone} / {groupItems.length}
                </span>
              </header>
              <ul className="divide-y">
                {groupItems.map((i) => (
                  <DutyRow
                    key={i.id}
                    item={i}
                    checked={!!optimistic.get(i.id)}
                    onToggle={handleToggle}
                    canWrite={canWrite}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  // Weekly / monthly — flat list grouped by owner_label for readability.
  const byOwner = new Map<string, DutiesItemWithCompletion[]>();
  for (const i of items) {
    const arr = byOwner.get(i.owner_label) ?? [];
    arr.push(i);
    byOwner.set(i.owner_label, arr);
  }
  const owners = [...byOwner.keys()].sort();
  return (
    <div className="space-y-4">
      {owners.map((owner) => {
        const groupItems = byOwner.get(owner)!;
        const groupDone = groupItems.filter((i) =>
          optimistic.get(i.id),
        ).length;
        return (
          <section
            key={owner}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <header className="px-4 py-2 border-b bg-muted/30 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{owner}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {groupDone} / {groupItems.length}
              </span>
            </header>
            <ul className="divide-y">
              {groupItems.map((i) => (
                <DutyRow
                  key={i.id}
                  item={i}
                  checked={!!optimistic.get(i.id)}
                  onToggle={handleToggle}
                  canWrite={canWrite}
                  hideOwner
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DutyRow({
  item,
  checked,
  onToggle,
  canWrite,
  hideOwner,
}: {
  item: DutiesItemWithCompletion;
  checked: boolean;
  onToggle: (itemId: string, done: boolean) => void;
  canWrite: boolean;
  hideOwner?: boolean;
}) {
  return (
    <li className="px-4 py-2 flex items-center gap-3">
      <Checkbox
        checked={checked}
        disabled={!canWrite}
        onCheckedChange={(c) => onToggle(item.id, Boolean(c))}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className={checked ? "text-muted-foreground line-through" : ""}>
          {item.description}
        </span>
      </div>
      {!hideOwner && (
        <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground shrink-0">
          {item.owner_label}
        </span>
      )}
    </li>
  );
}

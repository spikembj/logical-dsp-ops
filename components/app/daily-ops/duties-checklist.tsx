"use client";

import {
  useOptimistic,
  useRef,
  useState,
  useTransition,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  deleteDutyItem,
  toggleDutyCompletion,
  upsertDutyItem,
} from "@/app/actions/daily-ops";
import {
  DUTIES_GROUP_LABELS,
  DUTIES_GROUP_ORDER,
  chipClassForOwner,
  type DutiesCadence,
  type DutiesGroup,
  type DutiesItemWithCompletion,
  type DutiesScope,
} from "@/lib/queries/daily-ops-types";
import { cn } from "@/lib/utils";

/**
 * Checklist UI with inline editing for management.
 *
 * - Daily: groups by Preload out / Load out / Post / RTS / Closing.
 *   Each group has its own checklist + an "Add task" row at the
 *   bottom (management only).
 * - Weekly + monthly: grouped by owner_label for readability. A
 *   single "Add task" row sits at the bottom of the page (you pick
 *   the owner in the form).
 *
 * Toggling a checkbox uses optimistic UI so the checkmark feels
 * instant; the server confirms in the background.
 */
export function DutiesChecklist({
  cadence,
  periodKey,
  items,
  canWrite,
  canManage,
  scope = "ops",
  // When true, daily items render as one flat list (no preload/loadout
  // sub-sections). HR's checklist uses this — those buckets are
  // dispatch-specific. Weekly/monthly already flat-render so the flag
  // only matters for daily.
  flatList = false,
}: {
  cadence: DutiesCadence;
  periodKey: string;
  items: DutiesItemWithCompletion[];
  canWrite: boolean;
  canManage: boolean;
  scope?: DutiesScope;
  flatList?: boolean;
}) {
  const router = useRouter();
  const [, startSavingTransition] = useTransition();

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
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  if (cadence === "daily" && !flatList) {
    return (
      <div className="space-y-4">
        {DUTIES_GROUP_ORDER.map((g) => {
          const groupItems = items.filter((i) => i.group_label === g);
          const groupDone = groupItems.filter((i) =>
            optimistic.get(i.id),
          ).length;
          const nextSortOrder =
            groupItems.reduce((max, it) => Math.max(max, it.sort_order), 0) +
            10;
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
              {groupItems.length === 0 && !canManage ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No items in this section.
                </p>
              ) : (
                <ul className="divide-y">
                  {groupItems.map((i) => (
                    <DutyRow
                      key={i.id}
                      item={i}
                      checked={!!optimistic.get(i.id)}
                      onToggle={handleToggle}
                      canWrite={canWrite}
                      canManage={canManage}
                    />
                  ))}
                </ul>
              )}
              {canManage && (
                <AddTaskRow
                  cadence="daily"
                  group={g}
                  sortOrder={nextSortOrder}
                  scope={scope}
                />
              )}
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
  const allItemsMaxSort = items.reduce(
    (max, it) => Math.max(max, it.sort_order),
    0,
  );

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
                  canManage={canManage}
                  hideOwner
                />
              ))}
            </ul>
          </section>
        );
      })}
      {canManage && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Add task</h2>
          </header>
          <AddTaskRow
            cadence={cadence}
            group={null}
            sortOrder={allItemsMaxSort + 10}
            requireOwner
            scope={scope}
            defaultOwner={scope === "hr" ? "HR" : "Dispatcher"}
          />
        </section>
      )}
    </div>
  );
}

function DutyRow({
  item,
  checked,
  onToggle,
  canWrite,
  canManage,
  hideOwner,
}: {
  item: DutiesItemWithCompletion;
  checked: boolean;
  onToggle: (itemId: string, done: boolean) => void;
  canWrite: boolean;
  canManage: boolean;
  hideOwner?: boolean;
}) {
  const router = useRouter();
  const [pending, startSavingTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete "${item.description.slice(0, 60)}${item.description.length > 60 ? "…" : ""}"? Historical completion records for this item will also be deleted.`,
      )
    )
      return;
    startSavingTransition(async () => {
      const res = await deleteDutyItem({ item_id: item.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

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
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 shrink-0",
            chipClassForOwner(item.owner_label),
          )}
        >
          {item.owner_label}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label="Delete task"
          className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * Inline "+ Add task" footer for a section. Click to open the form;
 * fields appear inline with focus on description. Save / cancel buttons
 * commit or collapse back to the closed state.
 *
 * `requireOwner=true` is for weekly/monthly where the form needs an
 * explicit owner picker (no implicit grouping). For daily, owner is
 * still required (Dispatcher / Assistant / etc.) but we leave it at
 * its default suggestion.
 */
function AddTaskRow({
  cadence,
  group,
  sortOrder,
  requireOwner = false,
  scope = "ops",
  defaultOwner = "Dispatcher",
}: {
  cadence: DutiesCadence;
  group: DutiesGroup;
  sortOrder: number;
  requireOwner?: boolean;
  scope?: DutiesScope;
  defaultOwner?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState(defaultOwner);
  const [pending, startSavingTransition] = useTransition();
  const descRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDescription("");
    setOwner(defaultOwner);
  }

  function handleOpen() {
    setOpen(true);
    setTimeout(() => descRef.current?.focus(), 50);
  }

  function handleSave() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (!owner.trim()) {
      toast.error("Owner is required.");
      return;
    }
    startSavingTransition(async () => {
      const res = await upsertDutyItem({
        scope,
        cadence,
        // HR has no group buckets — keep group_label null even on daily.
        group_label: cadence === "daily" && scope === "ops" ? group : null,
        owner_label: owner.trim(),
        description: description.trim(),
        sort_order: sortOrder,
        active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t"
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </button>
    );
  }

  return (
    <div className="px-4 py-3 border-t bg-muted/20 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder="What needs to happen?"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        <Input
          value={owner}
          onChange={(e) => setOwner(e.currentTarget.value)}
          placeholder="Owner"
          className="sm:w-32"
          list={requireOwner ? "duty-owner-suggestions" : undefined}
        />
      </div>
      <datalist id="duty-owner-suggestions">
        <option value="Dispatcher" />
        <option value="Assistant" />
        <option value="Michael" />
        <option value="Barzin" />
      </datalist>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={pending || !description.trim() || !owner.trim()}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GripVertical,
  Pencil,
  Check,
  X,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  deleteOnboardingTemplateItem,
  reorderOnboardingTemplate,
  upsertOnboardingTemplateItem,
} from "@/app/actions/hr-candidates";
import type { CandidateOnboardingTemplateItem } from "@/lib/queries/hr-candidates-types";

/**
 * Inline editor for the onboarding paperwork list. Sits below Manage
 * Statuses on /hr/candidates, collapsible. Same patterns we use
 * everywhere: drag to reorder, click pencil to rename inline, Active
 * toggle to hide from candidate checklists without losing history,
 * trash to delete (cascades to all candidates' completion stamps for
 * that item).
 */
export function OnboardingTemplateAdmin({
  items,
}: {
  items: CandidateOnboardingTemplateItem[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<CandidateOnboardingTemplateItem[]>(items);

  const lastItemsRef = useRef(items);
  if (lastItemsRef.current !== items) {
    lastItemsRef.current = items;
    if (
      items.length !== order.length ||
      items.some(
        (s, i) => s.id !== order[i]?.id || s.description !== order[i]?.description,
      )
    ) {
      setOrder(items);
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function commitOrder(next: CandidateOnboardingTemplateItem[]) {
    setOrder(next);
    startTransition(async () => {
      const res = await reorderOnboardingTemplate({
        ordered_ids: next.map((s) => s.id),
      });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = order.findIndex((s) => s.id === dragId);
    const toIdx = order.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = order.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDragId(null);
    setDragOverId(null);
    commitOrder(next);
  }

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-sm hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Manage onboarding checklist</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {items.filter((i) => i.active).length} active · {items.length} total
        </span>
      </button>

      {open && (
        <div className="border-t p-3 space-y-3 bg-muted/10">
          <AddItemRow
            nextSortOrder={
              (order.reduce((m, s) => Math.max(m, s.sort_order), 0) || 0) + 10
            }
            onAdded={() => router.refresh()}
          />
          <div className="rounded-md border divide-y bg-card">
            {order.map((s) => (
              <ItemRow
                key={s.id}
                item={s}
                isDragging={dragId === s.id}
                isDragOver={dragOverId === s.id && dragId !== s.id}
                onDragStart={() => setDragId(s.id)}
                onDragEnter={() => {
                  if (dragId && dragId !== s.id) setDragOverId(s.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDrop={() => handleDrop(s.id)}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Items appear on every candidate whose status has the
            onboarding flag. Drag to reorder. Active off hides an item
            from new checklists without losing past completion records.
          </p>
        </div>
      )}
    </section>
  );
}

interface ItemProps {
  item: CandidateOnboardingTemplateItem;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function ItemRow({
  item,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: ItemProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(item.description);

  const lastItemRef = useRef(item);
  if (lastItemRef.current !== item) {
    lastItemRef.current = item;
    if (!editing) setDescription(item.description);
  }

  function patch(
    fields: Partial<Pick<CandidateOnboardingTemplateItem, "description" | "active">>,
  ) {
    startTransition(async () => {
      const res = await upsertOnboardingTemplateItem({
        id: item.id,
        description: fields.description ?? item.description,
        sort_order: item.sort_order,
        active: fields.active ?? item.active,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function saveDescription() {
    const trimmed = description.trim();
    if (!trimmed) {
      toast.error("Description cannot be empty.");
      return;
    }
    if (trimmed === item.description) {
      setEditing(false);
      return;
    }
    patch({ description: trimmed });
    setEditing(false);
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete "${item.description}"? Historical completion records for this item will also be removed.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteOnboardingTemplateItem({ item_id: item.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        if (editing) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 transition-colors",
        isDragging && "opacity-40",
        isDragOver && "bg-muted/60",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className={cn(
          "h-7 w-6 inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground",
          editing
            ? "cursor-not-allowed opacity-30"
            : "cursor-grab active:cursor-grabbing",
        )}
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveDescription();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDescription(item.description);
                setEditing(false);
              }
            }}
            autoFocus
            disabled={pending}
            className="h-8"
          />
        ) : (
          <span className="text-sm">{item.description}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => patch({ active: !item.active })}
        disabled={pending || editing}
        aria-pressed={item.active}
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50",
          item.active
            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        {item.active ? "active" : "inactive"}
      </button>

      <div className="inline-flex gap-0.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={saveDescription}
              disabled={pending}
              aria-label="Save"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setDescription(item.description);
                setEditing(false);
              }}
              disabled={pending}
              aria-label="Cancel"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            aria-label={`Edit ${item.description}`}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || editing}
          aria-label={`Delete ${item.description}`}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddItemRow({
  nextSortOrder,
  onAdded,
}: {
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = description.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await upsertOnboardingTemplateItem({
        description: trimmed,
        sort_order: nextSortOrder,
        active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added "${trimmed}".`);
      setDescription("");
      onAdded();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Add an onboarding step (e.g. Drug test scheduled)…"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
        className="h-9 flex-1"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !description.trim()}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>
    </div>
  );
}

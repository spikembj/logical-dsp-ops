"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
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
  deleteCandidateStatus,
  reorderCandidateStatuses,
  upsertCandidateStatus,
} from "@/app/actions/hr-candidates";
import {
  CANDIDATE_STATUS_COLORS,
  CANDIDATE_STATUS_CHIP_CLASSES,
  CANDIDATE_STATUS_SWATCH_CLASSES,
  type CandidateStatusColor,
  type CandidateStatusRow,
} from "@/lib/queries/hr-candidates-types";

/**
 * Status admin — lives on its own page at /hr/candidates/statuses.
 * Drag rows to reorder, click pencil to rename inline, click color
 * swatch to recolor, toggle Active / declined-flag / onboarding chips.
 * Same affordances as Shops admin (drag + inline edit) plus the color
 * picker and the two HR-specific behavior toggles.
 */
export function CandidateStatusesAdmin({
  statuses,
}: {
  statuses: CandidateStatusRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<CandidateStatusRow[]>(statuses);
  const lastStatusesRef = useRef(statuses);
  if (lastStatusesRef.current !== statuses) {
    lastStatusesRef.current = statuses;
    if (
      statuses.length !== order.length ||
      statuses.some(
        (s, i) =>
          s.id !== order[i]?.id ||
          s.name !== order[i]?.name ||
          s.color !== order[i]?.color,
      )
    ) {
      setOrder(statuses);
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function commitOrder(next: CandidateStatusRow[]) {
    setOrder(next);
    startTransition(async () => {
      const res = await reorderCandidateStatuses({
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
    <div className="space-y-3">
      <AddStatusRow
        nextSortOrder={
          (order.reduce((m, s) => Math.max(m, s.sort_order), 0) || 0) + 10
        }
        onAdded={() => router.refresh()}
      />
      <div className="rounded-md border divide-y bg-card">
        {order.map((s) => (
          <StatusRow
            key={s.id}
            status={s}
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
      <p className="text-xs text-muted-foreground">
        Drag rows to reorder. Click the color swatch to recolor. Toggle{" "}
        <strong>declined-flag</strong> on any status that should warn HR when a
        candidate with the same phone reapplies; toggle{" "}
        <strong>onboarding</strong> on any status whose candidates should see
        the onboarding checklist on their detail page.
      </p>
    </div>
  );
}

interface RowProps {
  status: CandidateStatusRow;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function StatusRow({
  status,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: RowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const lastStatusRef = useRef(status);
  if (lastStatusRef.current !== status) {
    lastStatusRef.current = status;
    if (!editing) setName(status.name);
  }

  function patch(
    fields: Partial<
      Pick<
        CandidateStatusRow,
        "name" | "color" | "active" | "treat_as_declined" | "is_onboarding"
      >
    >,
  ) {
    startTransition(async () => {
      const res = await upsertCandidateStatus({
        id: status.id,
        name: fields.name ?? status.name,
        color: (fields.color ?? status.color) as CandidateStatusColor,
        sort_order: status.sort_order,
        treat_as_declined:
          fields.treat_as_declined ?? status.treat_as_declined,
        is_onboarding: fields.is_onboarding ?? status.is_onboarding,
        active: fields.active ?? status.active,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (trimmed === status.name) {
      setEditing(false);
      return;
    }
    patch({ name: trimmed });
    setEditing(false);
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete status "${status.name}"? This is blocked if any candidates are still in it.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCandidateStatus({ status_id: status.id });
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
        e.dataTransfer.setData("text/plain", status.id);
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

      {/* Color swatch + picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setColorPickerOpen((v) => !v)}
          disabled={pending || editing}
          aria-label="Change color"
          className={cn(
            "h-6 w-6 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-110 disabled:opacity-50",
            CANDIDATE_STATUS_SWATCH_CLASSES[status.color],
          )}
        />
        {colorPickerOpen && (
          <div className="absolute z-10 mt-1 p-2 rounded-md border bg-popover shadow-md grid grid-cols-6 gap-1.5">
            {CANDIDATE_STATUS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  patch({ color: c });
                  setColorPickerOpen(false);
                }}
                aria-label={`Set color ${c}`}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                  CANDIDATE_STATUS_SWATCH_CLASSES[c],
                  c === status.color
                    ? "border-foreground"
                    : "border-background",
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setName(status.name);
                setEditing(false);
              }
            }}
            autoFocus
            disabled={pending}
            className="h-8"
          />
        ) : (
          <span
            className={cn(
              "inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-wider",
              CANDIDATE_STATUS_CHIP_CLASSES[status.color],
            )}
          >
            {status.name}
          </span>
        )}
      </div>

      {/* declined-flag toggle */}
      <button
        type="button"
        onClick={() => patch({ treat_as_declined: !status.treat_as_declined })}
        disabled={pending || editing}
        aria-pressed={status.treat_as_declined}
        title="When ON, a candidate later reapplying with the same phone gets a previously-declined warning."
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50",
          status.treat_as_declined
            ? "bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-100"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        declined-flag
      </button>

      {/* onboarding toggle */}
      <button
        type="button"
        onClick={() => patch({ is_onboarding: !status.is_onboarding })}
        disabled={pending || editing}
        aria-pressed={status.is_onboarding}
        title="When ON, candidates in this status see the onboarding checklist on their detail page."
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50",
          status.is_onboarding
            ? "bg-indigo-200 text-indigo-900 hover:bg-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-100"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        onboarding
      </button>

      {/* Active toggle */}
      <button
        type="button"
        onClick={() => patch({ active: !status.active })}
        disabled={pending || editing}
        aria-pressed={status.active}
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50",
          status.active
            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        {status.active ? "active" : "inactive"}
      </button>

      <div className="inline-flex gap-0.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={saveName}
              disabled={pending}
              aria-label="Save name"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setName(status.name);
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
            aria-label={`Edit ${status.name}`}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || editing}
          aria-label={`Delete ${status.name}`}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddStatusRow({
  nextSortOrder,
  onAdded,
}: {
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<CandidateStatusColor>("slate");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await upsertCandidateStatus({
        name: trimmed,
        color,
        sort_order: nextSortOrder,
        treat_as_declined: false,
        is_onboarding: false,
        active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${trimmed}.`);
      setName("");
      setColor("slate");
      onAdded();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="New status name…"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
        className="h-9 flex-1"
      />
      <select
        value={color}
        onChange={(e) => setColor(e.currentTarget.value as CandidateStatusColor)}
        disabled={pending}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
      >
        {CANDIDATE_STATUS_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>
    </div>
  );
}

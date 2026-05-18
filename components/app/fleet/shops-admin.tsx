"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  upsertVehicleShop,
  deleteVehicleShop,
  reorderVehicleShops,
} from "@/app/actions/fleet";
import { cn } from "@/lib/utils";
import type { VehicleShop } from "@/lib/queries/fleet-types";

/**
 * Manage the dropdown values used for each van's "Current shop / location"
 * field. Everything edits inline:
 *
 *   • Drag a row by its grip handle to reorder. We rewrite sort_order on
 *     drop — the user never sees or types a number.
 *   • Click the Active / Inactive chip to toggle visibility in the van
 *     dropdown.
 *   • Click the pencil to make the name editable in place; pencil turns
 *     into a checkmark while editing.
 *
 * We optimistically update local state on every interaction so the UI
 * reacts instantly, then router.refresh() once the server confirms.
 */
export function ShopsAdmin({ shops }: { shops: VehicleShop[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Local mirror so drag-drop reordering is instantaneous; the server
  // confirms in the background and we refresh from there.
  const [order, setOrder] = useState<VehicleShop[]>(shops);
  // If the parent re-renders with a different shops list (e.g. after
  // router.refresh()), trust that as the source of truth.
  const lastShopsRef = useRef(shops);
  if (lastShopsRef.current !== shops) {
    lastShopsRef.current = shops;
    // shops identity changed — adopt it.
    if (
      shops.length !== order.length ||
      shops.some((s, i) => s.id !== order[i]?.id || s.name !== order[i]?.name)
    ) {
      setOrder(shops);
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function commitOrder(next: VehicleShop[]) {
    setOrder(next);
    startTransition(async () => {
      const res = await reorderVehicleShops({
        ordered_ids: next.map((s) => s.id),
      });
      if (!res.ok) {
        toast.error(res.error);
        // Roll back by re-reading from server.
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
      <AddShopRow
        onAdded={() => router.refresh()}
        nextSortOrder={
          (order.reduce((m, s) => Math.max(m, s.sort_order), 0) || 0) + 10
        }
      />
      <div className="rounded-md border divide-y bg-card">
        {order.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
            No shops yet.
          </div>
        ) : (
          order.map((s) => (
            <ShopRow
              key={s.id}
              shop={s}
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
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  shop: VehicleShop;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function ShopRow({
  shop,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: RowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local mirrors for optimistic UI on active toggle + rename.
  const [active, setActive] = useState(shop.active);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shop.name);

  // If the server pushed a fresher row down (after refresh()), adopt it.
  const lastShopRef = useRef(shop);
  if (lastShopRef.current !== shop) {
    lastShopRef.current = shop;
    if (!editing) setName(shop.name);
    setActive(shop.active);
  }

  function toggleActive() {
    if (pending) return;
    const next = !active;
    setActive(next); // optimistic
    startTransition(async () => {
      const res = await upsertVehicleShop({
        id: shop.id,
        name: shop.name,
        sort_order: shop.sort_order,
        active: next,
      });
      if (!res.ok) {
        toast.error(res.error);
        setActive(!next); // roll back
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
    if (trimmed === shop.name) {
      // Nothing changed — just exit edit mode.
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await upsertVehicleShop({
        id: shop.id,
        name: trimmed,
        sort_order: shop.sort_order,
        active,
      });
      if (!res.ok) {
        toast.error(res.error);
        setName(shop.name); // roll back
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancelEdit() {
    setName(shop.name);
    setEditing(false);
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete "${shop.name}"? Any vans currently set to this shop will have their location cleared.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVehicleShop({ shop_id: shop.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${shop.name}.`);
      router.refresh();
    });
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        if (editing) return;
        e.dataTransfer.effectAllowed = "move";
        // Firefox requires data to be set for drag to fire.
        e.dataTransfer.setData("text/plain", shop.id);
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
          editing ? "cursor-not-allowed opacity-30" : "cursor-grab active:cursor-grabbing",
        )}
        // The grip is decorative — the whole row is the drag source.
        // We just want the visual affordance + a focusable target for
        // keyboard a11y placeholders.
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

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
                cancelEdit();
              }
            }}
            autoFocus
            disabled={pending}
            className="h-8"
          />
        ) : (
          <span className="text-sm font-medium truncate">{shop.name}</span>
        )}
      </div>

      <button
        type="button"
        onClick={toggleActive}
        disabled={pending || editing}
        aria-pressed={active}
        aria-label={active ? "Active — click to deactivate" : "Inactive — click to activate"}
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[11px] font-medium transition-colors disabled:opacity-50",
          active
            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        {active ? "Active" : "Inactive"}
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
              onClick={cancelEdit}
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
            aria-label={`Edit ${shop.name}`}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || editing}
          aria-label={`Delete ${shop.name}`}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddShopRow({
  onAdded,
  nextSortOrder,
}: {
  onAdded: () => void;
  nextSortOrder: number;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await upsertVehicleShop({
        name: trimmed,
        sort_order: nextSortOrder,
        active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${trimmed}.`);
      setName("");
      onAdded();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Add a shop or location…"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
        className="h-9"
      />
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertVehicleShop, deleteVehicleShop } from "@/app/actions/fleet";
import type { VehicleShop } from "@/lib/queries/fleet-types";

export function ShopsAdmin({ shops }: { shops: VehicleShop[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ShopDialog mode="create" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Sort</TableHead>
              <TableHead className="w-24">Active</TableHead>
              <TableHead className="text-right w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shops.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No shops yet.
                </TableCell>
              </TableRow>
            ) : (
              shops.map((s) => <ShopRow key={s.id} shop={s} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ShopRow({ shop }: { shop: VehicleShop }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
    <TableRow>
      <TableCell className="font-medium">{shop.name}</TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {shop.sort_order}
      </TableCell>
      <TableCell>
        {shop.active ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Inactive</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-1">
          <ShopDialog mode="edit" shop={shop} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            aria-label="Delete shop"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | { mode: "create"; shop?: undefined }
  | { mode: "edit"; shop: VehicleShop };

function ShopDialog(props: DialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = props.mode === "edit";

  const [name, setName] = useState(isEdit ? props.shop.name : "");
  const [sortOrder, setSortOrder] = useState<string>(
    isEdit ? String(props.shop.sort_order) : "100",
  );
  const [active, setActive] = useState(isEdit ? props.shop.active : true);

  function reset() {
    if (isEdit) {
      setName(props.shop.name);
      setSortOrder(String(props.shop.sort_order));
      setActive(props.shop.active);
    } else {
      setName("");
      setSortOrder("100");
      setActive(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const so = parseInt(sortOrder, 10);
    if (Number.isNaN(so) || so < 0) {
      toast.error("Sort order must be a non-negative integer.");
      return;
    }
    startTransition(async () => {
      const res = await upsertVehicleShop({
        id: isEdit ? props.shop.id : undefined,
        name: name.trim(),
        sort_order: so,
        active,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Updated." : "Added.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        className={
          isEdit
            ? "inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            : "inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
        }
        aria-label={isEdit ? `Edit ${props.shop.name}` : "Add shop"}
      >
        {isEdit ? <span className="text-xs">Edit</span> : <><Plus className="h-4 w-4" /> Add shop</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit shop" : "Add shop"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="shop-name">Name</Label>
            <Input
              id="shop-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort-order">Sort order</Label>
            <Input
              id="sort-order"
              type="number"
              min={0}
              max={10000}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.currentTarget.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Lower numbers appear first in the dropdown.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={active}
              onCheckedChange={(c) => setActive(Boolean(c))}
            />
            Active (show in the dropdown)
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

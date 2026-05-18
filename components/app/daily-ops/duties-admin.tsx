"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { upsertDutyItem, deleteDutyItem } from "@/app/actions/daily-ops";
import {
  DUTIES_GROUP_LABELS,
  type DutiesCadence,
  type DutiesGroup,
  type DutiesTemplateItem,
} from "@/lib/queries/daily-ops-types";

const CADENCE_TABS: { value: DutiesCadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function DutiesAdmin({ items }: { items: DutiesTemplateItem[] }) {
  const [tab, setTab] = useState<DutiesCadence>("daily");

  const filtered = useMemo(
    () => items.filter((i) => i.cadence === tab),
    [items, tab],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          {CADENCE_TABS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setTab(c.value)}
              className={
                "px-3 py-1.5 rounded-sm transition-colors " +
                (tab === c.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <DutyItemDialog mode="create" cadence={tab} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {tab === "daily" && <TableHead className="w-32">Group</TableHead>}
              <TableHead>Description</TableHead>
              <TableHead className="w-32">Owner</TableHead>
              <TableHead className="w-16 text-right">Sort</TableHead>
              <TableHead className="w-16">Active</TableHead>
              <TableHead className="w-20 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={tab === "daily" ? 6 : 5}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No items yet for this cadence.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => <DutyRow key={i.id} item={i} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DutyRow({ item }: { item: DutiesTemplateItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete "${item.description.slice(0, 60)}…"? Historical completion records for this item will also be deleted.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteDutyItem({ item_id: item.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  return (
    <TableRow className={item.active ? undefined : "opacity-60"}>
      {item.cadence === "daily" && (
        <TableCell className="text-xs text-muted-foreground">
          {item.group_label
            ? DUTIES_GROUP_LABELS[
                item.group_label as keyof typeof DUTIES_GROUP_LABELS
              ]
            : "—"}
        </TableCell>
      )}
      <TableCell className="text-sm">{item.description}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.owner_label}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
        {item.sort_order}
      </TableCell>
      <TableCell>
        {item.active ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            Yes
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex gap-1">
          <DutyItemDialog mode="edit" item={item} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            aria-label="Delete"
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
  | { mode: "create"; cadence: DutiesCadence; item?: undefined }
  | { mode: "edit"; cadence?: undefined; item: DutiesTemplateItem };

function DutyItemDialog(props: DialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = props.mode === "edit";

  const initialCadence: DutiesCadence = isEdit
    ? props.item.cadence
    : props.cadence;
  const [cadence, setCadence] = useState<DutiesCadence>(initialCadence);
  const [group, setGroup] = useState<DutiesGroup>(
    isEdit ? props.item.group_label : "preload_out",
  );
  const [owner, setOwner] = useState(isEdit ? props.item.owner_label : "");
  const [description, setDescription] = useState(
    isEdit ? props.item.description : "",
  );
  const [sortOrder, setSortOrder] = useState<string>(
    isEdit ? String(props.item.sort_order) : "100",
  );
  const [active, setActive] = useState(isEdit ? props.item.active : true);

  function reset() {
    if (isEdit) {
      setCadence(props.item.cadence);
      setGroup(props.item.group_label);
      setOwner(props.item.owner_label);
      setDescription(props.item.description);
      setSortOrder(String(props.item.sort_order));
      setActive(props.item.active);
    } else {
      setCadence(props.cadence);
      setGroup("preload_out");
      setOwner("");
      setDescription("");
      setSortOrder("100");
      setActive(true);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (!owner.trim()) {
      toast.error("Owner is required.");
      return;
    }
    const so = parseInt(sortOrder, 10);
    if (Number.isNaN(so) || so < 0) {
      toast.error("Sort order must be a non-negative integer.");
      return;
    }
    startTransition(async () => {
      const res = await upsertDutyItem({
        id: isEdit ? props.item.id : undefined,
        cadence,
        group_label: cadence === "daily" ? group : null,
        owner_label: owner.trim(),
        description: description.trim(),
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
        aria-label={isEdit ? "Edit" : "Add duty"}
      >
        {isEdit ? <span className="text-xs">Edit</span> : <><Plus className="h-4 w-4" /> Add duty</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit duty" : "Add duty"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cadence">Cadence</Label>
              <select
                id="cadence"
                value={cadence}
                onChange={(e) =>
                  setCadence(e.currentTarget.value as DutiesCadence)
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {cadence === "daily" && (
              <div className="space-y-2">
                <Label htmlFor="group">Group</Label>
                <select
                  id="group"
                  value={group ?? "preload_out"}
                  onChange={(e) =>
                    setGroup(e.currentTarget.value as DutiesGroup)
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="preload_out">Preload out</option>
                  <option value="load_out">Load out</option>
                  <option value="post_load_out">Post load out</option>
                  <option value="rts">Return to station</option>
                  <option value="closing">Closing</option>
                </select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner">Owner</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.currentTarget.value)}
              placeholder="e.g. Dispatcher, Assistant, Michael"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort">Sort order</Label>
            <Input
              id="sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.currentTarget.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Lower appears first within the group / owner.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={active}
              onCheckedChange={(c) => setActive(Boolean(c))}
            />
            Active
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

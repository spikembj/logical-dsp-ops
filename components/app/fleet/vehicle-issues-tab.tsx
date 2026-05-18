"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createVehicleIssue,
  updateVehicleIssue,
} from "@/app/actions/fleet";
import type {
  VehicleIssueRow,
  VehicleIssueCategory,
  VehicleIssueSeverity,
  VehicleIssueStatus,
} from "@/lib/queries/fleet-types";
import { cn } from "@/lib/utils";

type Filter = "open" | "in_shop" | "all";

const CATEGORIES: { value: VehicleIssueCategory; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "cosmetic", label: "Cosmetic" },
  { value: "tires", label: "Tires" },
  { value: "other", label: "Other" },
];

const SEVERITIES: { value: VehicleIssueSeverity; label: string }[] = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "major", label: "Major" },
  { value: "out_of_service", label: "Out of service" },
];

const STATUSES: { value: VehicleIssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_shop", label: "In shop" },
  { value: "fixed", label: "Fixed" },
  { value: "closed_no_repair", label: "Closed (no repair)" },
];

export function VehicleIssuesTab({
  vehicleId,
  issues,
}: {
  vehicleId: string;
  issues: VehicleIssueRow[];
}) {
  const [filter, setFilter] = useState<Filter>("open");

  const filtered = issues.filter((i) => {
    if (filter === "open") return i.status === "open";
    if (filter === "in_shop") return i.status === "in_shop";
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["open", "in_shop", "all"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "open" ? "Open" : f === "in_shop" ? "In shop" : "All"}
            </Button>
          ))}
        </div>
        <IssueDialog vehicleId={vehicleId} mode="create" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {filter === "all" ? "No issues yet." : `No ${filter.replace(/_/g, " ")} issues.`}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {filtered.map((i) => (
            <IssueRow key={i.id} issue={i} vehicleId={vehicleId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  vehicleId,
}: {
  issue: VehicleIssueRow;
  vehicleId: string;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={issue.severity} />
            <CategoryBadge category={issue.category} />
            <StatusBadge status={issue.status} />
            {issue.auto_created && (
              <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                auto
              </span>
            )}
            {issue.source === "eod" && (
              <span
                className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                title="Logged via the end-of-day report"
              >
                EOD
              </span>
            )}
          </div>
          <p className="text-sm mt-1.5">{issue.description}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Reported {format(parseISO(issue.reported_at), "MMM d, yyyy")}
            {issue.resolved_at && (
              <> · Resolved {format(parseISO(issue.resolved_at), "MMM d")}</>
            )}
          </p>
          {issue.resolution_notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {issue.resolution_notes}
            </p>
          )}
        </div>
        <IssueDialog vehicleId={vehicleId} mode="edit" issue={issue} />
      </div>
    </li>
  );
}

function IssueDialog({
  vehicleId,
  mode,
  issue,
}: {
  vehicleId: string;
  mode: "create" | "edit";
  issue?: VehicleIssueRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [category, setCategory] = useState<VehicleIssueCategory>(
    issue?.category ?? "other",
  );
  const [severity, setSeverity] = useState<VehicleIssueSeverity>(
    issue?.severity ?? "minor",
  );
  const [description, setDescription] = useState(issue?.description ?? "");
  const [status, setStatus] = useState<VehicleIssueStatus>(
    issue?.status ?? "open",
  );
  const [resolutionNotes, setResolutionNotes] = useState(
    issue?.resolution_notes ?? "",
  );

  function handleSave() {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createVehicleIssue({
              vehicle_id: vehicleId,
              category,
              severity,
              description,
              status,
            })
          : await updateVehicleIssue({
              issue_id: issue!.id,
              category,
              severity,
              description,
              status,
              resolution_notes: resolutionNotes || null,
            });
      if (res.ok) {
        toast.success(mode === "create" ? "Issue logged." : "Issue updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleQuickResolve() {
    startTransition(async () => {
      const res = await updateVehicleIssue({
        issue_id: issue!.id,
        category,
        severity,
        description,
        status: "fixed",
        resolution_notes: resolutionNotes || null,
      });
      if (res.ok) {
        toast.success("Marked fixed.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          mode === "create"
            ? "inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            : "inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
        )}
        aria-label={mode === "create" ? "Log new issue" : "Edit issue"}
      >
        {mode === "create" ? (
          <>
            <Plus className="h-4 w-4" /> Log issue
          </>
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Log new issue" : "Edit issue"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as VehicleIssueCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as VehicleIssueSeverity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder="Dent on rear bumper, oil leak, etc."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as VehicleIssueStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "edit" && (
            <div className="space-y-2">
              <Label htmlFor="res-notes">Resolution notes</Label>
              <Textarea
                id="res-notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.currentTarget.value)}
                placeholder="What did we do to fix it?"
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {mode === "edit" && status !== "fixed" && status !== "closed_no_repair" && (
            <Button
              variant="outline"
              onClick={handleQuickResolve}
              disabled={pending}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Mark fixed
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || !description.trim()}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeverityBadge({ severity }: { severity: VehicleIssueSeverity }) {
  const styles: Record<VehicleIssueSeverity, string> = {
    minor: "bg-muted text-muted-foreground",
    moderate:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    major:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    out_of_service:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
        styles[severity],
      )}
    >
      {severity.replace(/_/g, " ")}
    </span>
  );
}

function CategoryBadge({ category }: { category: VehicleIssueCategory }) {
  return (
    <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: VehicleIssueStatus }) {
  const styles: Record<VehicleIssueStatus, string> = {
    open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    in_shop:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
    fixed:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    closed_no_repair: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5",
        styles[status],
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

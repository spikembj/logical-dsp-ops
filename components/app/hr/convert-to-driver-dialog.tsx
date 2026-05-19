"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck, X } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { convertCandidateToDriver } from "@/app/actions/hr-candidates";

/**
 * Convert-to-driver dialog. Opens from the candidate detail page
 * header (button is disabled unless the candidate's status has
 * is_onboarding=true AND every active onboarding item is checked —
 * the server enforces the same in an RPC, this is just the UX layer).
 *
 * Form fields the user picked in the design Q&A:
 *   - Position (driver/helper toggle, default driver)
 *   - Hire date (defaults to today)
 *   - Approved vehicle types (multi-select chips)
 *
 * On success: candidate is archived + linked to the new driver, the
 * toast carries a "Open driver" link, and the page refreshes.
 */
const VEHICLE_TYPE_OPTIONS = [
  { value: "cdv", label: "CDV" },
  { value: "edv", label: "EDV" },
  { value: "standard_parcel", label: "Standard parcel" },
] as const;
type VehicleType = (typeof VEHICLE_TYPE_OPTIONS)[number]["value"];

export function ConvertToDriverDialog({
  candidateId,
  candidateName,
  disabled,
  disabledReason,
}: {
  candidateId: string;
  candidateName: string;
  disabled: boolean;
  /** Tooltip shown on the disabled button so HR knows why it cannot click. */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [position, setPosition] = useState<"driver" | "helper">("driver");
  const [hireDate, setHireDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vehicleTypes, setVehicleTypes] = useState<Set<VehicleType>>(
    new Set(["edv"]),
  );

  function toggleType(t: VehicleType) {
    setVehicleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (vehicleTypes.size === 0) {
      toast.error("Pick at least one vehicle type.");
      return;
    }
    startTransition(async () => {
      const res = await convertCandidateToDriver({
        candidate_id: candidateId,
        position,
        hire_date: hireDate,
        approved_vehicle_types: [...vehicleTypes],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const driverId = res.data?.driver_id;
      toast.success(
        <span>
          Converted!{" "}
          {driverId && (
            <Link
              href={`/drivers/${driverId}`}
              className="underline font-medium"
            >
              Open driver record
            </Link>
          )}
        </span>,
        { duration: 6000 },
      );
      setOpen(false);
      router.push("/hr/candidates");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-colors",
          disabled
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-emerald-600 text-white hover:bg-emerald-700",
        )}
        title={disabled ? disabledReason : undefined}
      >
        <UserCheck className="h-4 w-4" />
        Convert to driver
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert {candidateName} to driver</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This creates a new <code>drivers</code> row linked back to
            this candidate. The candidate moves to the Archive.
          </p>

          <div className="space-y-2">
            <Label>Position</Label>
            <div className="inline-flex rounded-md border overflow-hidden text-sm">
              {(["driver", "helper"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={cn(
                    "px-3 py-1.5 transition-colors capitalize",
                    position === p
                      ? "bg-foreground text-background"
                      : "bg-background hover:bg-muted text-muted-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hire-date">Hire date</Label>
            <Input
              id="hire-date"
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.currentTarget.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Approved vehicle types</Label>
            <div className="flex flex-wrap gap-1.5">
              {VEHICLE_TYPE_OPTIONS.map((opt) => {
                const on = vehicleTypes.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleType(opt.value)}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium transition-colors border",
                      on
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground border-input hover:bg-muted",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

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
              {pending ? "Converting..." : "Confirm convert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

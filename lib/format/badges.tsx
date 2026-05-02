import { Badge } from "@/components/ui/badge";
import type { DriverStatus, Tier } from "@/lib/types/database";

/**
 * Tiny consistent UI for tier + driver-status pills. Used in the drivers list
 * and the driver-detail header strip.
 */

const TIER_LABEL: Record<Tier, string> = {
  fantastic_plus: "Fantastic+",
  fantastic: "Fantastic",
  great: "Great",
  fair: "Fair",
  poor: "Poor",
};

const TIER_CLASS: Record<Tier, string> = {
  fantastic_plus: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  fantastic: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  great: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  fair: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  poor: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export function TierBadge({ tier }: { tier: Tier | null | undefined }) {
  if (!tier) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="No tier">
        —
      </span>
    );
  }
  return (
    <Badge variant="outline" className={TIER_CLASS[tier]}>
      {TIER_LABEL[tier]}
    </Badge>
  );
}

const STATUS_LABEL: Record<DriverStatus, string> = {
  active: "Active",
  loa: "LOA",
  terminated: "Terminated",
};

const STATUS_CLASS: Record<DriverStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  loa: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  terminated: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30",
};

export function StatusBadge({ status }: { status: DriverStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

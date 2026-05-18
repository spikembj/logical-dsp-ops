import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  VehicleRow,
  VehicleListItem,
  VehicleIssueRow,
  VehicleIssueStatus,
  VehiclePartRow,
} from "./fleet-types";

/**
 * Server-only query helpers for the Fleet dashboard, list, and detail
 * pages. Phase 2.
 *
 * Scope reminder: Amazon owns vehicle health (PMs, DVIC, AVI, DOT,
 * warning lights, odometer). These queries surface only the gaps we fill
 * — operational status, registration expiry, our own issues + parts,
 * shop location.
 *
 * Types + pure helpers live in `./fleet-types` so client components can
 * import them without dragging this server-only module into the bundle.
 */

// Re-export types + helpers so existing call sites keep working without
// updating every import.
export * from "./fleet-types";
export { daysUntilExpiry } from "./fleet-types";

const OPEN_ISSUE_STATUSES: VehicleIssueStatus[] = ["open", "in_shop"];

/**
 * Map a Supabase row (which still has the deprecated current_shop_location
 * text column + a joined vehicle_shops object) into our VehicleRow shape
 * that only exposes the FK-resolved name. Centralized here so listVehicles
 * and getVehicleByVin can both use it.
 */
type SupabaseVehicleJoinedRow = Omit<
  VehicleRow,
  "current_shop_name" | "current_shop_id"
> & {
  current_shop_id: string | null;
  vehicle_shops: { name: string } | null;
};

function mapVehicleRow(r: SupabaseVehicleJoinedRow): VehicleRow {
  return {
    ...r,
    current_shop_id: r.current_shop_id,
    current_shop_name: r.vehicle_shops?.name ?? null,
  };
}

const VEHICLE_SELECT = "*, vehicle_shops (name)";

/** All vehicles + their open-issue counts, sorted by vehicle_name. */
export const listVehicles = cache(async (): Promise<VehicleListItem[]> => {
  const supabase = await createClient();
  const [vehiclesRes, issuesRes] = await Promise.all([
    supabase.from("vehicles").select(VEHICLE_SELECT).order("vehicle_name"),
    supabase
      .from("vehicle_issues")
      .select("vehicle_id, status")
      .in("status", OPEN_ISSUE_STATUSES),
  ]);
  if (vehiclesRes.error) {
    console.error("listVehicles failed:", vehiclesRes.error);
    return [];
  }
  const openByVehicle = new Map<string, number>();
  for (const i of (issuesRes.data ?? []) as { vehicle_id: string }[]) {
    openByVehicle.set(i.vehicle_id, (openByVehicle.get(i.vehicle_id) ?? 0) + 1);
  }
  return (
    (vehiclesRes.data ?? []) as unknown as SupabaseVehicleJoinedRow[]
  ).map((v) => ({
    ...mapVehicleRow(v),
    open_issues_count: openByVehicle.get(v.id) ?? 0,
  }));
});

export interface FleetDashboardData {
  vehicles: VehicleListItem[];
  totals: {
    total: number;
    operational: number;
    grounded: number;
    registration_expiring: number;
    open_issues_distinct_vehicles: number;
  };
  byShop: Map<string, VehicleListItem[]>;
  openIssues: (VehicleIssueRow & { vehicle: VehicleListItem })[];
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export const getFleetDashboardData = cache(
  async (): Promise<FleetDashboardData> => {
    const supabase = await createClient();
    const vehicles = await listVehicles();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const sixtyOut = new Date(today.getTime() + SIXTY_DAYS_MS);

    const totals = {
      total: vehicles.length,
      operational: 0,
      grounded: 0,
      registration_expiring: 0,
      open_issues_distinct_vehicles: 0,
    };

    const byShop = new Map<string, VehicleListItem[]>();
    for (const v of vehicles) {
      if (v.operational_status === "operational") totals.operational++;
      else totals.grounded++;
      if (v.registration_expiry_date) {
        const exp = new Date(`${v.registration_expiry_date}T00:00:00Z`);
        if (exp <= sixtyOut) totals.registration_expiring++;
      }
      if (v.open_issues_count > 0) totals.open_issues_distinct_vehicles++;

      const shop = v.current_shop_name?.trim();
      if (shop) {
        const list = byShop.get(shop) ?? [];
        list.push(v);
        byShop.set(shop, list);
      }
    }

    const { data: issuesData } = await supabase
      .from("vehicle_issues")
      .select("*")
      .in("status", OPEN_ISSUE_STATUSES)
      .order("reported_at", { ascending: false })
      .limit(25);

    const byId = new Map(vehicles.map((v) => [v.id, v]));
    const openIssues = (
      (issuesData ?? []) as VehicleIssueRow[]
    )
      .map((i) => {
        const vehicle = byId.get(i.vehicle_id);
        if (!vehicle) return null;
        return { ...i, vehicle };
      })
      .filter((x): x is VehicleIssueRow & { vehicle: VehicleListItem } => !!x);

    return { vehicles, totals, byShop, openIssues };
  },
);

export const getVehicleByVin = cache(
  async (vin: string): Promise<VehicleRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .select(VEHICLE_SELECT)
      .eq("vin", vin)
      .maybeSingle();
    if (error) {
      console.error("getVehicleByVin failed:", error);
      return null;
    }
    if (!data) return null;
    return mapVehicleRow(data as unknown as SupabaseVehicleJoinedRow);
  },
);

/** All vehicle shops, ordered by sort_order then name. */
export const listVehicleShops = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_shops")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) {
    console.error("listVehicleShops failed:", error);
    return [];
  }
  // Type from fleet-types.
  type Row = import("./fleet-types").VehicleShop;
  return (data ?? []) as Row[];
});

export const listVehicleIssues = cache(
  async (vehicleId: string): Promise<VehicleIssueRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicle_issues")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("reported_at", { ascending: false });
    if (error) {
      console.error("listVehicleIssues failed:", error);
      return [];
    }
    return (data as VehicleIssueRow[]) ?? [];
  },
);

// ---------------------------------------------------------------------------
// PAVE (Periodic Amazon Vehicle Evaluation) — quarterly mandatory inspection
// ---------------------------------------------------------------------------

import type { PaveInspectionRow, PaveQuarterStatus } from "./fleet-types";

/** All PAVE inspections for a vehicle, newest first. */
export const listPaveInspectionsForVehicle = cache(
  async (vehicleId: string): Promise<PaveInspectionRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicle_pave_inspections")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("year", { ascending: false })
      .order("quarter", { ascending: false })
      .order("completed_date", { ascending: false });
    if (error) {
      console.error("listPaveInspectionsForVehicle failed:", error);
      return [];
    }
    return (data as PaveInspectionRow[]) ?? [];
  },
);

/**
 * Per-vehicle PAVE status for a given quarter, indexed by vehicle_id.
 * Includes every passed-in vehicle, even those with zero inspections this
 * quarter (latestScore = null), so callers don't need to merge by hand.
 */
export const getPaveStatusForQuarter = cache(
  async (
    vehicleIds: string[],
    quarter: number,
    year: number,
  ): Promise<Map<string, PaveQuarterStatus>> => {
    const result = new Map<string, PaveQuarterStatus>();
    for (const id of vehicleIds) {
      result.set(id, {
        vehicleId: id,
        latestScore: null,
        latestDate: null,
        attemptCount: 0,
      });
    }
    if (vehicleIds.length === 0) return result;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicle_pave_inspections")
      .select("vehicle_id, completed_date, score")
      .in("vehicle_id", vehicleIds)
      .eq("quarter", quarter)
      .eq("year", year)
      .order("completed_date", { ascending: false });
    if (error) {
      console.error("getPaveStatusForQuarter failed:", error);
      return result;
    }

    for (const row of (data ?? []) as {
      vehicle_id: string;
      completed_date: string;
      score: 1 | 2 | 3 | 4;
    }[]) {
      const s = result.get(row.vehicle_id);
      if (!s) continue;
      s.attemptCount += 1;
      // Order desc, so the first row we see per vehicle is the latest.
      if (s.latestScore === null) {
        s.latestScore = row.score;
        s.latestDate = row.completed_date;
      }
    }
    return result;
  },
);

/**
 * Every parts row across the fleet, joined with the van name + VIN
 * for display. Used by the Fleet dashboard's Parts surface so the
 * user can see "what is on order and which van it is for" without
 * clicking into individual van details.
 *
 * Returned in status-priority order (needed → ordered → partial →
 * received → installed → returned), then most recent ordered_at
 * first. Callers filter to open-only as needed.
 */
export interface VehiclePartWithVehicle extends VehiclePartRow {
  vehicle_name: string;
  vehicle_vin: string;
}

const PART_STATUS_PRIORITY: Record<string, number> = {
  needed: 0,
  ordered: 1,
  partial: 2,
  received: 3,
  installed: 4,
  returned: 5,
};

export const listAllVehicleParts = cache(
  async (): Promise<VehiclePartWithVehicle[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicle_parts")
      .select(
        `id, vehicle_id, issue_id, part_name, part_number,
         quantity_ordered, quantity_received, quantity_installed,
         status, vendor, cost, ordered_at, received_at, notes,
         created_at, updated_at,
         vehicles (vehicle_name, vin)`,
      );
    if (error) {
      console.error("listAllVehicleParts failed:", error);
      return [];
    }
    type Joined = VehiclePartRow & {
      vehicles: { vehicle_name: string | null; vin: string } | null;
    };
    return ((data ?? []) as unknown as Joined[])
      .map((r) => ({
        ...r,
        vehicle_name: r.vehicles?.vehicle_name ?? r.vehicles?.vin ?? "?",
        vehicle_vin: r.vehicles?.vin ?? "",
      }))
      .sort((a, b) => {
        const sp =
          (PART_STATUS_PRIORITY[a.status] ?? 99) -
          (PART_STATUS_PRIORITY[b.status] ?? 99);
        if (sp !== 0) return sp;
        // Within a status bucket: most recent ordered_at first; nulls last.
        const av = a.ordered_at ?? a.created_at;
        const bv = b.ordered_at ?? b.created_at;
        return bv.localeCompare(av);
      });
  },
);

export const listVehicleParts = cache(
  async (vehicleId: string): Promise<VehiclePartRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vehicle_parts")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("listVehicleParts failed:", error);
      return [];
    }
    return (data as VehiclePartRow[]) ?? [];
  },
);

/**
 * Types and pure helpers shared by Fleet client + server code.
 *
 * Kept separate from `fleet.ts` (which imports `server-only`) so that
 * client components can pull these in without Next dragging the whole
 * server-side query module into the client bundle.
 */

export type VehicleOperationalStatus =
  | "operational"
  | "grounded"
  | "ready_for_audit";

export type VehicleOwnershipType =
  | "amazon_owned"
  | "amazon_rental"
  | "amazon_leased";

export type VehicleStatusSource = "amazon" | "manual";

export interface VehicleRow {
  id: string;
  vin: string;
  vehicle_name: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  sub_model: string | null;
  year: number | null;
  service_type: string | null;
  service_tier: string | null;
  ownership_type: VehicleOwnershipType | null;
  vehicle_provider: string | null;
  registration_expiry_date: string | null;
  registered_state: string | null;
  station_code: string | null;
  operational_status: VehicleOperationalStatus;
  operational_status_source: VehicleStatusSource;
  operational_status_changed_at: string;
  operational_status_changed_by: string | null;
  status_reason_message: string | null;
  manual_status_note: string | null;
  current_shop_location: string | null;
  eod_parking_location: string | null;
  notes: string | null;
  raw_data: Record<string, unknown> | null;
  imported_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleListItem extends VehicleRow {
  open_issues_count: number;
}

export type VehicleIssueCategory =
  | "damage"
  | "mechanical"
  | "electrical"
  | "cosmetic"
  | "tires"
  | "other";

export type VehicleIssueSeverity =
  | "minor"
  | "moderate"
  | "major"
  | "out_of_service";

export type VehicleIssueStatus =
  | "open"
  | "in_shop"
  | "fixed"
  | "closed_no_repair";

export interface VehicleIssueRow {
  id: string;
  vehicle_id: string;
  reported_at: string;
  reported_by: string | null;
  category: VehicleIssueCategory;
  severity: VehicleIssueSeverity;
  description: string;
  status: VehicleIssueStatus;
  resolved_at: string | null;
  resolution_notes: string | null;
  auto_created: boolean;
  created_at: string;
  updated_at: string;
}

export type VehiclePartStatus =
  | "needed"
  | "ordered"
  | "partial"
  | "received"
  | "installed"
  | "returned";

export interface VehiclePartRow {
  id: string;
  vehicle_id: string;
  issue_id: string | null;
  part_name: string;
  part_number: string | null;
  quantity_ordered: number;
  quantity_received: number;
  quantity_installed: number;
  status: VehiclePartStatus;
  vendor: string | null;
  cost: number | null;
  ordered_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Days-until-expiry, signed. Negative = already expired. Null for
 * vehicles without a registration date.
 */
export function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const exp = new Date(`${iso}T00:00:00Z`);
  return Math.round((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

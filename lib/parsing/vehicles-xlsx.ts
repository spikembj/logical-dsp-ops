import "server-only";
import * as XLSX from "xlsx";

/**
 * Parses Amazon's Vehicles xlsx export — the file that backs `/fleet`.
 *
 * Amazon's column names (camelCase) are mapped to our schema (snake_case).
 * Anything not mapped is preserved in `raw` so future schema additions
 * don't require a reimport.
 *
 * The file is small (~60 rows) so we parse the whole thing eagerly into
 * memory. No streaming needed.
 */

export type ParsedVehicleOperationalStatus =
  | "operational"
  | "grounded"
  | "ready_for_audit";

export type ParsedVehicleOwnershipType =
  | "amazon_owned"
  | "amazon_rental"
  | "amazon_leased";

export interface ParsedVehicle {
  vin: string;
  vehicle_name: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  sub_model: string | null;
  year: number | null;
  service_type: string | null;
  service_tier: string | null;
  ownership_type: ParsedVehicleOwnershipType | null;
  vehicle_provider: string | null;
  operational_status: ParsedVehicleOperationalStatus;
  status_reason_message: string | null;
  registration_expiry_date: string | null; // YYYY-MM-DD
  registered_state: string | null;
  station_code: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedVehicles {
  vehicles: ParsedVehicle[];
  skipped: { row_index: number; reason: string }[];
}

function mapOperationalStatus(v: unknown): ParsedVehicleOperationalStatus {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "GROUNDED") return "grounded";
  if (s === "READY_FOR_AUDIT") return "ready_for_audit";
  // Anything else (OPERATIONAL, blank, unknown) defaults to operational.
  // Amazon currently emits exactly these three values; defaulting unknown
  // to operational is the least-disruptive choice (we'd rather miss a
  // grounding than spuriously ground a working van).
  return "operational";
}

function mapOwnershipType(v: unknown): ParsedVehicleOwnershipType | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "AMAZON_OWNED") return "amazon_owned";
  if (s === "AMAZON_RENTAL") return "amazon_rental";
  if (s === "AMAZON_LEASED") return "amazon_leased";
  return null;
}

/**
 * Normalize a cell value to an ISO date string YYYY-MM-DD.
 *
 * Amazon's xlsx serializes dates as actual ISO strings most of the time
 * (e.g. "2026-12-30") but SheetJS will also pass us JS Date objects if
 * the cell was a real Excel date. Handle both.
 */
function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    // already ISO?
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return v == null ? null : String(v).trim() || null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export async function parseVehiclesXlsx(
  bytes: Uint8Array,
): Promise<ParsedVehicles> {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { vehicles: [], skipped: [] };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true, // keep Date objects as Dates so toIsoDate can detect them
  });

  const vehicles: ParsedVehicle[] = [];
  const skipped: ParsedVehicles["skipped"] = [];

  rows.forEach((row, idx) => {
    const vin = nonEmptyString(row.vin);
    if (!vin) {
      skipped.push({ row_index: idx + 2, reason: "Missing VIN" });
      return;
    }
    vehicles.push({
      vin,
      vehicle_name: nonEmptyString(row.vehicleName),
      license_plate: nonEmptyString(row.licensePlateNumber),
      make: nonEmptyString(row.make),
      model: nonEmptyString(row.model),
      sub_model: nonEmptyString(row.subModel),
      year: toInt(row.year),
      service_type: nonEmptyString(row.serviceType),
      service_tier: nonEmptyString(row.serviceTier),
      ownership_type: mapOwnershipType(row.ownershipType),
      vehicle_provider: nonEmptyString(row.vehicleProvider),
      operational_status: mapOperationalStatus(row.operationalStatus),
      status_reason_message: nonEmptyString(row.statusReasonMessage),
      registration_expiry_date: toIsoDate(row.registrationExpiryDate),
      registered_state: nonEmptyString(row.registeredState),
      station_code: nonEmptyString(row.stationCode),
      raw: row,
    });
  });

  return { vehicles, skipped };
}

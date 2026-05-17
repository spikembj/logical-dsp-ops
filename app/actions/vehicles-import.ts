"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";
import {
  parseVehiclesXlsx,
  type ParsedVehicle,
} from "@/lib/parsing/vehicles-xlsx";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

export interface VehiclesImportSummary {
  ok: boolean;
  error?: string;
  parsed_count?: number;
  inserted_count?: number;
  updated_count?: number;
  manual_override_skipped_count?: number;
  grounded_count?: number;
  ungrounded_count?: number;
  skipped?: { row_index: number; reason: string }[];
  errors?: { vin: string; reason: string }[];
}

interface ExistingRow {
  id: string;
  vin: string;
  operational_status: string;
  operational_status_source: string;
}

export async function importVehiclesXlsx(
  formData: FormData,
): Promise<VehiclesImportSummary> {
  await requireManagement();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256OfBytes(bytes);
  const dup = await findDuplicateImport(supabase, hash);
  if (dup) return { ok: false, error: formatDuplicateError(dup) };

  let parsed: { vehicles: ParsedVehicle[]; skipped: VehiclesImportSummary["skipped"] };
  try {
    parsed = await parseVehiclesXlsx(bytes);
  } catch (e) {
    console.error("parseVehiclesXlsx failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse vehicles file.",
    };
  }

  const fileName = file.name || "vehicles.xlsx";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "vehicles",
      file_name: fileName,
      file_hash: hash,
      row_count: parsed.vehicles.length,
    })
    .select("id")
    .single();
  if (importErr || !importRow) {
    return {
      ok: false,
      error: `Could not create import record: ${importErr?.message ?? "unknown"}`,
    };
  }
  const fileImportId = importRow.id as string;

  // Index existing rows by VIN so we can:
  //   * apply Amazon fields only to rows whose operational_status_source = 'amazon'
  //   * still update non-status fields on manual-override rows
  //   * detect inserts vs updates for the result card
  //   * pass the touched IDs to apply_vehicle_grounding_changes()
  const vins = parsed.vehicles.map((v) => v.vin);
  const { data: existing, error: existErr } = await supabase
    .from("vehicles")
    .select("id, vin, operational_status, operational_status_source")
    .in("vin", vins);
  if (existErr) {
    return { ok: false, error: `Reading existing vehicles: ${existErr.message}` };
  }
  const byVin = new Map<string, ExistingRow>();
  for (const r of (existing ?? []) as ExistingRow[]) {
    byVin.set(r.vin, r);
  }

  let inserted = 0;
  let updated = 0;
  let manualSkipped = 0;
  const errors: VehiclesImportSummary["errors"] = [];
  const touchedIds: string[] = [];

  for (const v of parsed.vehicles) {
    const existingRow = byVin.get(v.vin);

    // Always-applied columns (Amazon-managed, not gated by override)
    const base = {
      vehicle_name: v.vehicle_name,
      license_plate: v.license_plate,
      make: v.make,
      model: v.model,
      sub_model: v.sub_model,
      year: v.year,
      service_type: v.service_type,
      service_tier: v.service_tier,
      ownership_type: v.ownership_type,
      vehicle_provider: v.vehicle_provider,
      registration_expiry_date: v.registration_expiry_date,
      registered_state: v.registered_state,
      station_code: v.station_code,
      status_reason_message: v.status_reason_message,
      raw_data: v.raw,
      imported_from: fileImportId,
    };

    if (!existingRow) {
      // INSERT: new vehicle, status fields from Amazon
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          vin: v.vin,
          ...base,
          operational_status: v.operational_status,
          operational_status_source: "amazon",
          operational_status_changed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) {
        errors.push({
          vin: v.vin,
          reason: `Insert failed: ${error?.message ?? "unknown"}`,
        });
        continue;
      }
      inserted++;
      touchedIds.push(data.id as string);
    } else {
      // UPDATE: status field obeys the override; non-status fields always update
      const updatePayload: Record<string, unknown> = { ...base };
      if (existingRow.operational_status_source === "manual") {
        manualSkipped++;
        // Don't touch operational_status / source / changed_at
      } else {
        // Only bump changed_at when the status actually changed
        if (existingRow.operational_status !== v.operational_status) {
          updatePayload.operational_status = v.operational_status;
          updatePayload.operational_status_source = "amazon";
          updatePayload.operational_status_changed_at = new Date().toISOString();
        }
      }
      const { error } = await supabase
        .from("vehicles")
        .update(updatePayload)
        .eq("id", existingRow.id);
      if (error) {
        errors.push({
          vin: v.vin,
          reason: `Update failed: ${error.message}`,
        });
        continue;
      }
      updated++;
      touchedIds.push(existingRow.id);
    }
  }

  // Run the grounding side-effects (auto-create / auto-close issues).
  // Function ignores manual-source rows itself, so passing every touched
  // ID is fine.
  let groundedCount = 0;
  let ungroundedCount = 0;
  if (touchedIds.length > 0) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "apply_vehicle_grounding_changes",
      { affected_vehicle_ids: touchedIds },
    );
    if (rpcErr) {
      errors.push({
        vin: "(grounding-side-effects)",
        reason: rpcErr.message,
      });
    } else if (rpcData && Array.isArray(rpcData) && rpcData[0]) {
      groundedCount = (rpcData[0] as { grounded_count?: number }).grounded_count ?? 0;
      ungroundedCount =
        (rpcData[0] as { ungrounded_count?: number }).ungrounded_count ?? 0;
    }
  }

  await supabase
    .from("file_imports")
    .update({
      success_count: inserted + updated,
      error_count: errors.length,
      errors,
    })
    .eq("id", fileImportId);

  revalidatePath("/import");
  revalidatePath("/fleet");
  revalidatePath("/fleet/vans");

  return {
    ok: errors.length === 0 || inserted + updated > 0,
    error:
      errors.length > 0 && inserted + updated === 0
        ? errors[0]?.reason
        : undefined,
    parsed_count: parsed.vehicles.length,
    inserted_count: inserted,
    updated_count: updated,
    manual_override_skipped_count: manualSkipped,
    grounded_count: groundedCount,
    ungrounded_count: ungroundedCount,
    skipped: parsed.skipped,
    errors,
  };
}

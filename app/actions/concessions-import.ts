"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseConcessionsCsv,
  type ParsedConcession,
  type ParsedConcessionsReport,
} from "@/lib/parsing/concessions-csv";

export interface ConcessionsImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedConcessionsReport;
  matched_count?: number;
  created_drivers_count?: number;
  concessions_written?: number;
  errors?: { driver_name: string; reason: string }[];
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function importConcessionsCsv(
  formData: FormData,
): Promise<ConcessionsImportSummary> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let parsed: ParsedConcessionsReport;
  try {
    const text = await file.text();
    parsed = parseConcessionsCsv(text);
  } catch (e) {
    console.error("parseConcessionsCsv failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse CSV.",
    };
  }

  const { data: existing, error: drvErr } = await supabase
    .from("drivers")
    .select("id, transporter_id, full_name");
  if (drvErr) return { ok: false, error: `Reading drivers: ${drvErr.message}` };

  const byTid = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const d of existing ?? []) {
    if (d.transporter_id) byTid.set(d.transporter_id, d.id);
    byName.set(normalizeName(d.full_name), d.id);
  }

  const fileName = file.name || "concessions.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "concessions",
      file_name: fileName,
      row_count: parsed.concessions.length,
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

  let matched = 0;
  let createdDrivers = 0;
  const errors: ConcessionsImportSummary["errors"] = [];
  type Insert = {
    driver_id: string;
    tracking_id: string;
    concession_date: string;
    pickup_date: string | null;
    delivery_attempt_date: string | null;
    delivery_date: string | null;
    delivery_type: string | null;
    service_area: string | null;
    dsp_name: string | null;
    impacts_dsb: boolean;
    defect_types: string[];
    raw_data: ParsedConcession;
    imported_from: string;
  };
  // Dedupe per natural key (driver_id + tracking_id) — last write wins.
  const byKey = new Map<string, Insert>();

  for (const c of parsed.concessions) {
    let driverId: string | undefined =
      byTid.get(c.transporter_id) ?? byName.get(normalizeName(c.full_name));

    if (driverId) {
      matched++;
      if (!byTid.has(c.transporter_id)) {
        const { error } = await supabase
          .from("drivers")
          .update({ transporter_id: c.transporter_id })
          .eq("id", driverId)
          .is("transporter_id", null);
        if (!error) byTid.set(c.transporter_id, driverId);
      }
    } else {
      const { data: created, error } = await supabase
        .from("drivers")
        .insert({
          full_name: c.full_name,
          transporter_id: c.transporter_id,
          status: "active",
          approved_vehicle_types: [],
        })
        .select("id")
        .single();
      if (error || !created) {
        errors.push({
          driver_name: c.full_name,
          reason: `Create failed: ${error?.message ?? "unknown"}`,
        });
        continue;
      }
      driverId = created.id as string;
      byTid.set(c.transporter_id, driverId);
      byName.set(normalizeName(c.full_name), driverId);
      createdDrivers++;
    }

    const key = `${driverId}::${c.tracking_id}`;
    byKey.set(key, {
      driver_id: driverId!,
      tracking_id: c.tracking_id,
      concession_date: c.concession_date,
      pickup_date: c.pickup_date,
      delivery_attempt_date: c.delivery_attempt_date,
      delivery_date: c.delivery_date,
      delivery_type: c.delivery_type,
      service_area: c.service_area,
      dsp_name: c.dsp_name,
      impacts_dsb: c.impacts_dsb,
      defect_types: c.defect_types,
      raw_data: c,
      imported_from: fileImportId,
    });
  }

  const rows = [...byKey.values()];
  let writtenCount = 0;
  if (rows.length > 0) {
    const { error: insErr, count } = await supabase
      .from("concessions")
      .upsert(rows, {
        onConflict: "driver_id,tracking_id",
        count: "exact",
      });
    if (insErr) {
      errors.push({
        driver_name: "(concessions upsert)",
        reason: insErr.message,
      });
    } else {
      writtenCount = count ?? rows.length;
    }
  }

  await supabase
    .from("file_imports")
    .update({
      success_count: writtenCount,
      error_count: errors.length,
      errors,
    })
    .eq("id", fileImportId);

  await supabase.rpc("refresh_driver_active_status");

  revalidatePath("/import");
  revalidatePath("/drivers");
  revalidatePath("/");

  return {
    ok: errors.length === 0 || writtenCount > 0,
    error: errors.length > 0 && writtenCount === 0 ? errors[0]?.reason : undefined,
    parsed,
    matched_count: matched,
    created_drivers_count: createdDrivers,
    concessions_written: writtenCount,
    errors,
  };
}

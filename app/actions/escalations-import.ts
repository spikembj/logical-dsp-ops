"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseEscalationsCsv,
  type ParsedEscalation,
  type ParsedEscalationsReport,
} from "@/lib/parsing/escalations-csv";

export interface EscalationsImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedEscalationsReport;
  matched_count?: number;
  created_drivers_count?: number;
  escalations_written?: number;
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

export async function importEscalationsCsv(
  formData: FormData,
): Promise<EscalationsImportSummary> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let parsed: ParsedEscalationsReport;
  try {
    const text = await file.text();
    parsed = parseEscalationsCsv(text);
  } catch (e) {
    console.error("parseEscalationsCsv failed:", e);
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

  const fileName = file.name || "escalations.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "escalations",
      file_name: fileName,
      row_count: parsed.escalations.length,
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
  const errors: EscalationsImportSummary["errors"] = [];
  type EscalationInsert = {
    driver_id: string;
    station_code: string | null;
    dsp_name: string | null;
    bucket: string | null;
    category: string | null;
    behavior: string;
    incident_date: string;
    dsp_notification_date: string | null;
    ack_status: string | null;
    scorecard_week: string | null;
    total_defects_120d: number | null;
    source: "amazon-escalations";
    raw_data: ParsedEscalation;
    imported_from: string;
  };
  // Dedupe on the same natural key as the unique index.
  const byKey = new Map<string, EscalationInsert>();

  for (const e of parsed.escalations) {
    let driverId: string | undefined =
      byTid.get(e.transporter_id) ?? byName.get(normalizeName(e.full_name));

    if (driverId) {
      matched++;
      if (!byTid.has(e.transporter_id)) {
        const { error } = await supabase
          .from("drivers")
          .update({ transporter_id: e.transporter_id })
          .eq("id", driverId)
          .is("transporter_id", null);
        if (!error) byTid.set(e.transporter_id, driverId);
      }
    } else {
      const { data: created, error } = await supabase
        .from("drivers")
        .insert({
          full_name: e.full_name,
          transporter_id: e.transporter_id,
          status: "active",
          approved_vehicle_types: [],
        })
        .select("id")
        .single();
      if (error || !created) {
        errors.push({
          driver_name: e.full_name,
          reason: `Create failed: ${error?.message ?? "unknown"}`,
        });
        continue;
      }
      driverId = created.id as string;
      byTid.set(e.transporter_id, driverId);
      byName.set(normalizeName(e.full_name), driverId);
      createdDrivers++;
    }

    const key = `${driverId}::${e.incident_date}::${e.behavior}::${e.bucket ?? ""}`;
    byKey.set(key, {
      driver_id: driverId!,
      station_code: e.station_code,
      dsp_name: e.dsp_name,
      bucket: e.bucket,
      category: e.category,
      behavior: e.behavior,
      incident_date: e.incident_date,
      dsp_notification_date: e.dsp_notification_date,
      ack_status: e.ack_status,
      scorecard_week: e.scorecard_week,
      total_defects_120d: e.total_defects_120d,
      source: "amazon-escalations",
      raw_data: e,
      imported_from: fileImportId,
    });
  }

  const rows = [...byKey.values()];
  let writtenCount = 0;
  if (rows.length > 0) {
    const { error: insErr, count } = await supabase
      .from("escalations")
      .upsert(rows, {
        onConflict: "driver_id,incident_date,behavior,bucket",
        count: "exact",
      });
    if (insErr) {
      errors.push({
        driver_name: "(escalations upsert)",
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
    escalations_written: writtenCount,
    errors,
  };
}

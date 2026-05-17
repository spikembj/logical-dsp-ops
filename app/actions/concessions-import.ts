"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseConcessionsCsv,
  type ParsedConcession,
  type ParsedConcessionsReport,
} from "@/lib/parsing/concessions-csv";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

export interface ConcessionsImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedConcessionsReport;
  matched_count?: number;
  /** Drivers in the file who don't exist in our roster — skipped, not created.
   *  Amazon's concessions CSV file name often ends in `_ALL_…`, meaning it
   *  spans every DSP on the account, so unknown names are almost always
   *  drivers from another station (e.g. DUT4 in our case). */
  skipped_unknown_count?: number;
  skipped_unknown_sample?: string[];
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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256OfBytes(bytes);
  const dup = await findDuplicateImport(supabase, hash);
  if (dup) return { ok: false, error: formatDuplicateError(dup) };

  let parsed: ParsedConcessionsReport;
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
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
      file_hash: hash,
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
  const skippedNames: string[] = [];
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

    if (!driverId) {
      // Not in our roster — skip rather than auto-create. Driver profiles
      // are created only from scorecards / DSP overview (per-station). All
      // other imports are match-only to avoid pulling in drivers from
      // other DSPs on shared Amazon exports.
      skippedNames.push(c.full_name);
      continue;
    }
    matched++;
    if (!byTid.has(c.transporter_id)) {
      const { error } = await supabase
        .from("drivers")
        .update({ transporter_id: c.transporter_id })
        .eq("id", driverId)
        .is("transporter_id", null);
      if (!error) byTid.set(c.transporter_id, driverId);
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
    skipped_unknown_count: skippedNames.length,
    skipped_unknown_sample: skippedNames.slice(0, 5),
    concessions_written: writtenCount,
    errors,
  };
}

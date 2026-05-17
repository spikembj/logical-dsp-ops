"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseCdfNegativeCsv,
  type ParsedCdfNegative,
  type ParsedCdfNegativeReport,
} from "@/lib/parsing/cdf-negative-csv";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

export interface CdfImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedCdfNegativeReport;
  matched_count?: number;
  /** Drivers in the file who aren't in our roster — skipped, not created.
   *  Driver profiles are created only by scorecards / DSP overview. */
  skipped_unknown_count?: number;
  skipped_unknown_sample?: string[];
  rows_written?: number;
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

export async function importCdfNegativeCsv(
  formData: FormData,
): Promise<CdfImportSummary> {
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

  let parsed: ParsedCdfNegativeReport;
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    parsed = parseCdfNegativeCsv(text);
  } catch (e) {
    console.error("parseCdfNegativeCsv failed:", e);
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

  const fileName = file.name || "cdf-negative.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "cdf",
      file_name: fileName,
      file_hash: hash,
      row_count: parsed.rows.length,
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
  const errors: CdfImportSummary["errors"] = [];
  type Insert = {
    driver_id: string;
    tracking_id: string;
    delivery_group_id: string | null;
    delivery_date: string;
    feedback_details: string | null;
    feedback_types: string[];
    raw_data: ParsedCdfNegative;
    imported_from: string;
  };
  const byKey = new Map<string, Insert>();

  for (const c of parsed.rows) {
    let driverId: string | undefined =
      byTid.get(c.transporter_id) ?? byName.get(normalizeName(c.full_name));

    if (!driverId) {
      // Not in our roster — skip rather than auto-create. Only scorecards
      // and DSP overview create drivers, since those are per-station.
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
      delivery_group_id: c.delivery_group_id,
      delivery_date: c.delivery_date,
      feedback_details: c.feedback_details,
      feedback_types: c.feedback_types,
      raw_data: c,
      imported_from: fileImportId,
    });
  }

  const rows = [...byKey.values()];
  let writtenCount = 0;
  if (rows.length > 0) {
    const { error: insErr, count } = await supabase
      .from("cdf_negative")
      .upsert(rows, {
        onConflict: "driver_id,tracking_id",
        count: "exact",
      });
    if (insErr) {
      errors.push({
        driver_name: "(cdf upsert)",
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
    error:
      errors.length > 0 && writtenCount === 0 ? errors[0]?.reason : undefined,
    parsed,
    matched_count: matched,
    skipped_unknown_count: skippedNames.length,
    skipped_unknown_sample: skippedNames.slice(0, 5),
    rows_written: writtenCount,
    errors,
  };
}

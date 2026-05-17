"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parsePodDetailsPdf,
  type ParsedPodDriver,
  type ParsedPodDetails,
} from "@/lib/parsing/pod-details-pdf";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

export interface PodDetailsImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedPodDetails;
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

export async function importPodDetailsPdf(
  formData: FormData,
): Promise<PodDetailsImportSummary> {
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

  let parsed: ParsedPodDetails;
  try {
    parsed = await parsePodDetailsPdf(bytes, file.name);
  } catch (e) {
    console.error("parsePodDetailsPdf failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse PDF.",
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

  const fileName = file.name || "pod-details.pdf";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "pod_details",
      file_name: fileName,
      file_hash: hash,
      row_count: parsed.drivers.length,
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
  const errors: PodDetailsImportSummary["errors"] = [];
  type Insert = {
    driver_id: string;
    week_ending: string;
    opportunities: number;
    success: number;
    bypass: number;
    rejects: number;
    blurry_photo: number;
    package_in_car: number;
    package_in_hand: number;
    package_too_close: number;
    photo_too_dark: number;
    human_in_picture: number;
    package_not_clearly_visible: number;
    no_package_detected: number;
    other_reject: number;
    raw_data: ParsedPodDriver;
    imported_from: string;
  };
  const byKey = new Map<string, Insert>();

  for (const d of parsed.drivers) {
    let driverId: string | undefined =
      byTid.get(d.transporter_id) ?? byName.get(normalizeName(d.full_name));

    if (!driverId) {
      // Not in our roster — skip rather than auto-create. Only scorecards
      // and DSP overview create drivers, since those are per-station.
      skippedNames.push(d.full_name);
      continue;
    }
    matched++;
    if (!byTid.has(d.transporter_id)) {
      const { error } = await supabase
        .from("drivers")
        .update({ transporter_id: d.transporter_id })
        .eq("id", driverId)
        .is("transporter_id", null);
      if (!error) byTid.set(d.transporter_id, driverId);
    }

    const key = `${driverId}::${parsed.week_ending}`;
    byKey.set(key, {
      driver_id: driverId!,
      week_ending: parsed.week_ending,
      opportunities: d.opportunities,
      success: d.success,
      bypass: d.bypass,
      rejects: d.rejects,
      blurry_photo: d.blurry_photo,
      package_in_car: d.package_in_car,
      package_in_hand: d.package_in_hand,
      package_too_close: d.package_too_close,
      photo_too_dark: d.photo_too_dark,
      human_in_picture: d.human_in_picture,
      package_not_clearly_visible: d.package_not_clearly_visible,
      no_package_detected: d.no_package_detected,
      other_reject: d.other_reject,
      raw_data: d,
      imported_from: fileImportId,
    });
  }

  const rows = [...byKey.values()];
  let writtenCount = 0;
  if (rows.length > 0) {
    const { error: insErr, count } = await supabase
      .from("pod_details")
      .upsert(rows, {
        onConflict: "driver_id,week_ending",
        count: "exact",
      });
    if (insErr) {
      errors.push({
        driver_name: "(pod_details upsert)",
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

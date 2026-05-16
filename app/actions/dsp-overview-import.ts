"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseDspOverviewCsv,
  type ParsedDspOverviewDriver,
  type ParsedDspOverviewReport,
} from "@/lib/parsing/dsp-overview-csv";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

/**
 * Server action: accept an uploaded DSP Overview Dashboard CSV, parse it,
 * then upsert one scorecard row per (driver, week_ending). Same matching
 * + audit pattern as the scorecard PDF import — the difference is this
 * source also gives us per-driver tier + overall score, which the PDF
 * doesn't expose.
 *
 * The CSV may contain multiple weeks; all are imported in one shot.
 */

export interface DspImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedDspOverviewReport;
  matched_count?: number;
  created_drivers_count?: number;
  scorecards_written?: number;
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

export async function importDspOverviewCsv(
  formData: FormData,
): Promise<DspImportSummary> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // 1. Read bytes, hash, refuse exact re-uploads, then parse.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256OfBytes(bytes);
  const dup = await findDuplicateImport(supabase, hash);
  if (dup) return { ok: false, error: formatDuplicateError(dup) };

  let parsed: ParsedDspOverviewReport;
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    parsed = parseDspOverviewCsv(text);
  } catch (e) {
    console.error("parseDspOverviewCsv failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse CSV.",
    };
  }

  // 2. Pull existing drivers for matching (by both tid and name).
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

  // 3. Audit row.
  const fileName = file.name || "dsp-overview.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "scorecard", // same destination table
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

  // 4. Resolve / create drivers; build dedup'd scorecard rows.
  let createdDrivers = 0;
  let matched = 0;
  const errors: DspImportSummary["errors"] = [];

  type ScorecardInsert = {
    driver_id: string;
    week_ending: string;
    tier: string | null;
    overall_score: number | null;
    delivered: number | null;
    fico_score: number | null;
    dcr: number | null;
    delivery_completion_rate: number | null;
    cdf: number | null;
    ced: number | null;
    dsb: number | null;
    pod: number | null;
    psb: number | null;
    seatbelt_off_rate: number | null;
    speeding_event_rate: number | null;
    distractions_rate: number | null;
    following_distance_rate: number | null;
    sign_signal_violations_rate: number | null;
    raw_data: ParsedDspOverviewDriver;
    imported_from: string;
  };
  const byKey = new Map<string, ScorecardInsert>();

  for (const d of parsed.drivers) {
    let driverId: string | undefined =
      byTid.get(d.transporter_id) ?? byName.get(normalizeName(d.full_name));

    if (driverId) {
      matched++;
      // If matched by name, populate transporter_id for next time.
      if (!byTid.has(d.transporter_id)) {
        const { error } = await supabase
          .from("drivers")
          .update({ transporter_id: d.transporter_id })
          .eq("id", driverId)
          .is("transporter_id", null);
        if (error && !/duplicate/i.test(error.message)) {
          console.warn(
            `Could not set transporter_id on existing driver ${driverId}: ${error.message}`,
          );
        } else {
          byTid.set(d.transporter_id, driverId);
        }
      }
    } else {
      const { data: created, error } = await supabase
        .from("drivers")
        .insert({
          full_name: d.full_name,
          transporter_id: d.transporter_id,
          status: "active",
          approved_vehicle_types: [],
        })
        .select("id")
        .single();
      if (error || !created) {
        errors.push({
          driver_name: d.full_name,
          reason: `Create failed: ${error?.message ?? "unknown"}`,
        });
        continue;
      }
      driverId = created.id as string;
      byTid.set(d.transporter_id, driverId);
      byName.set(normalizeName(d.full_name), driverId);
      createdDrivers++;
    }

    const key = `${driverId}::${d.week_ending}`;
    byKey.set(key, {
      driver_id: driverId!,
      week_ending: d.week_ending,
      tier: d.tier,
      overall_score: d.overall_score,
      delivered: d.delivered,
      fico_score: d.fico_score,
      dcr: d.dcr,
      delivery_completion_rate: d.dcr,
      cdf: d.cdf,
      ced: d.ced,
      dsb: d.dsb,
      pod: d.pod,
      psb: d.psb,
      seatbelt_off_rate: d.seatbelt_off_rate,
      speeding_event_rate: d.speeding_event_rate,
      distractions_rate: d.distractions_rate,
      following_distance_rate: d.following_distance_rate,
      sign_signal_violations_rate: d.sign_signal_violations_rate,
      raw_data: d,
      imported_from: fileImportId,
    });
  }

  const scorecardRows = [...byKey.values()];

  // 5. Upsert.
  const { error: scoreErr, count: scorecardsWritten } = await supabase
    .from("scorecards")
    .upsert(scorecardRows, {
      onConflict: "driver_id,week_ending",
      count: "exact",
    });

  if (scoreErr) {
    errors.push({
      driver_name: "(scorecards upsert)",
      reason: scoreErr.message,
    });
  }

  // 6. Update audit row.
  await supabase
    .from("file_imports")
    .update({
      success_count:
        (scorecardsWritten ?? scorecardRows.length) - errors.length,
      error_count: errors.length,
      errors,
    })
    .eq("id", fileImportId);

  // 7. Refresh active/inactive status.
  await supabase.rpc("refresh_driver_active_status");

  revalidatePath("/drivers");
  revalidatePath("/import");
  revalidatePath("/");

  return {
    ok: !scoreErr,
    error: scoreErr?.message,
    parsed,
    matched_count: matched,
    created_drivers_count: createdDrivers,
    scorecards_written: scorecardsWritten ?? scorecardRows.length,
    errors,
  };
}

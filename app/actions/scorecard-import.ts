"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseScorecardPdf,
  type ParsedScorecard,
  type ParsedScorecardDriver,
} from "@/lib/parsing/scorecard-pdf";

/**
 * Server action: accept an uploaded scorecard PDF, parse it, write a
 * file_imports audit row, then upsert one scorecard per driver listed.
 *
 * Driver matching strategy:
 *   1. exact match on transporter_id (after first import these are populated)
 *   2. fall back to normalized full_name (lowercase, single-spaced)
 *   3. if neither matches, INSERT a new driver with the data we have
 *
 * Re-importing the same week overwrites the prior scorecard rows for that
 * (driver, week_ending). Spec calls for re-import warning via file_hash —
 * deferred to step 8 polish.
 */

export interface ImportSummary {
  ok: boolean;
  error?: string;
  // present on success:
  parsed?: ParsedScorecard;
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

export async function importScorecardPdf(
  formData: FormData,
): Promise<ImportSummary> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // 1. Read + parse
  let parsed: ParsedScorecard;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    parsed = await parseScorecardPdf(bytes);
  } catch (e) {
    console.error("parseScorecardPdf failed:", e);
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not parse PDF.",
    };
  }

  // 2. Pull existing drivers for matching. Small enough to fetch in one go.
  const { data: existing, error: drvErr } = await supabase
    .from("drivers")
    .select("id, transporter_id, full_name");
  if (drvErr) {
    return { ok: false, error: `Reading drivers: ${drvErr.message}` };
  }

  const byTid = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const d of existing ?? []) {
    if (d.transporter_id) byTid.set(d.transporter_id, d.id);
    byName.set(normalizeName(d.full_name), d.id);
  }

  // 3. file_imports audit row (insert first so we can reference its id).
  const fileName = file.name || "scorecard.pdf";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "scorecard",
      file_name: fileName,
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

  // 4. Resolve / create a driver_id for each PDF row.
  let createdDrivers = 0;
  let matched = 0;
  const errors: ImportSummary["errors"] = [];
  type ScorecardInsert = {
    driver_id: string;
    week_ending: string;
    delivered: number | null;
    fico_score: number | null;
    dcr: number | null;
    delivery_completion_rate: number | null;
    cdf: number | null;
    ced: number | null;
    dsb: number | null;
    pod: number | null;
    psb: number | null;
    dsb_count: number | null;
    pod_opps: number | null;
    seatbelt_off_rate: number | null;
    speeding_event_rate: number | null;
    distractions_rate: number | null;
    following_distance_rate: number | null;
    sign_signal_violations_rate: number | null;
    raw_data: ParsedScorecardDriver;
    imported_from: string;
  };
  // Deduped by (driver_id, week_ending) — Postgres' ON CONFLICT can't handle
  // two rows targeting the same conflict in a single INSERT. Last write wins.
  const byKey = new Map<string, ScorecardInsert>();

  for (const d of parsed.drivers) {
    let driverId: string | undefined =
      byTid.get(d.transporter_id) ?? byName.get(normalizeName(d.full_name));

    if (driverId) {
      matched++;
      // If we matched by name, populate transporter_id for next time.
      if (!byTid.has(d.transporter_id)) {
        const { error } = await supabase
          .from("drivers")
          .update({ transporter_id: d.transporter_id })
          .eq("id", driverId)
          .is("transporter_id", null);
        if (error && !/duplicate/i.test(error.message)) {
          // Non-fatal — log and continue.
          console.warn(
            `Could not set transporter_id on existing driver ${driverId}: ${error.message}`,
          );
        } else {
          // refresh local map so a duplicate name+id later in the loop hits it
          byTid.set(d.transporter_id, driverId);
        }
      }
    } else {
      // Create a new driver row.
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

    const key = `${driverId}::${parsed.week_ending}`;
    byKey.set(key, {
      driver_id: driverId!,
      week_ending: parsed.week_ending,
      delivered: d.delivered,
      fico_score: d.fico_score,
      dcr: d.dcr,
      delivery_completion_rate: d.dcr, // same value, both columns kept per spec
      cdf: d.cdf_dpmo,
      ced: d.ced,
      dsb: d.dsb,
      pod: d.pod,
      psb: d.psb,
      dsb_count: d.dsb_count,
      pod_opps: d.pod_opps,
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

  // 5. Upsert scorecards. The (driver_id, week_ending) unique constraint
  //    means re-imports of the same week overwrite the prior rows.
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

  // 6. Update the file_imports audit row with the final tallies.
  await supabase
    .from("file_imports")
    .update({
      success_count: (scorecardsWritten ?? scorecardRows.length) - errors.length,
      error_count: errors.length,
      errors: errors,
    })
    .eq("id", fileImportId);

  // 7. Refresh driver active/inactive status based on the new data window.
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

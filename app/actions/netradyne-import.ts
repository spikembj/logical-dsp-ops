"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseNetradyneCsv,
  type ParsedNetradyneReport,
} from "@/lib/parsing/netradyne-csv";
import { findFuzzyMatch, normalizeName } from "@/lib/util/name-match";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

/**
 * Server action: accept an uploaded Netradyne event CSV, parse it, then
 * wipe-and-replace prior safety_events for the same period+source before
 * inserting one row per (driver, event_type) with a non-zero count.
 *
 * Driver matching is by normalized full_name (we don't store Netradyne
 * IDs). Unmatched drivers are **skipped**, not auto-created — Netradyne
 * camera accounts often span multiple physical DSP locations (e.g. DUT4
 * + DUT7 under one Netradyne org), and auto-creating would pollute this
 * DSP's drivers list with people we don't operate.
 *
 * A driver becomes part of this DSP when they appear in any
 * Amazon-issued data source: scorecards / DSP Overview / POD Details /
 * Concessions / CDF Negative / Escalations. Those imports do auto-create
 * because each of those reports is station-specific. Once a driver
 * exists from one of those sources, subsequent Netradyne imports will
 * attach their safety events.
 */

export interface NetradyneImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedNetradyneReport;
  matched_count?: number;
  /** Always 0 — Netradyne no longer auto-creates drivers. Kept on the type
   * so the shared import-result UI keeps compiling; the Netradyne tab
   * shows skipped_unknown_count instead. */
  created_drivers_count?: number;
  /** Names present in the CSV that don't match any existing driver in
   * this DSP. Sampled in the UI; full list lives in errors[] of the
   * file_imports audit row. */
  skipped_unknown_count?: number;
  skipped_unknown_sample?: string[];
  /** Names matched via the fuzzy fallback (Alex → Alexander, Mike →
   * Michael, etc.). Surfaced so a human can spot-check; full list also
   * lives in errors[] of the file_imports audit row. */
  fuzzy_matched?: {
    netradyne_name: string;
    matched_to: string;
    reason: string;
  }[];
  events_written?: number;
  events_replaced?: number;
  errors?: { driver_name: string; reason: string }[];
}

export async function importNetradyneCsv(
  formData: FormData,
): Promise<NetradyneImportSummary> {
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

  let parsed: ParsedNetradyneReport;
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    parsed = parseNetradyneCsv(text);
  } catch (e) {
    console.error("parseNetradyneCsv failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse CSV.",
    };
  }

  // 2. Pull existing drivers for matching. Helpers excluded from fuzzy
  //    pool — Amazon doesn't issue scorecards to helpers, so any helper
  //    name match against a Netradyne entry is almost certainly wrong.
  const { data: existing, error: drvErr } = await supabase
    .from("drivers")
    .select("id, full_name, position");
  if (drvErr) {
    return { ok: false, error: `Reading drivers: ${drvErr.message}` };
  }

  const byName = new Map<string, string>();
  const fuzzyCandidates: { id: string; full_name: string }[] = [];
  for (const d of existing ?? []) {
    byName.set(normalizeName(d.full_name), d.id);
    if (d.position !== "helper") {
      fuzzyCandidates.push({ id: d.id as string, full_name: d.full_name });
    }
  }

  // 3. file_imports audit row.
  const fileName = file.name || "netradyne.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "netradyne",
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

  // 4. Resolve driver IDs. Try strict name match first, then fuzzy fallback
  //    (nickname / first-name-prefix / extra-last-name) for the legal-vs-
  //    nickname mismatch case (e.g. Netradyne "Alexander Ritsche" → app
  //    "Alex Ritsche"). Fuzzy is conservative: only auto-matches when one
  //    candidate matches; ambiguous → skip. Truly unknown names → skip.
  let matched = 0;
  const skippedNames: string[] = [];
  const fuzzyMatched: NonNullable<NetradyneImportSummary["fuzzy_matched"]> =
    [];
  const errors: NetradyneImportSummary["errors"] = [];
  type EventInsert = {
    driver_id: string;
    event_date: string;
    event_type: string;
    severity: "impacting" | "non_impacting";
    count: number;
    source: "netradyne";
    raw_data: Record<string, unknown>;
    imported_from: string;
  };
  const eventRows: EventInsert[] = [];

  // event_date is the period_end as a midnight timestamp. The actual period
  // span is preserved in raw_data so we never lose it.
  const eventDate = `${parsed.period_end}T00:00:00Z`;

  for (const d of parsed.drivers) {
    let driverId = byName.get(normalizeName(d.full_name));
    if (!driverId) {
      const fuzzy = findFuzzyMatch(d.full_name, fuzzyCandidates);
      if (fuzzy) {
        driverId = fuzzy.driverId;
        fuzzyMatched.push({
          netradyne_name: d.full_name,
          matched_to: fuzzy.fullName,
          reason: fuzzy.reason,
        });
      }
    }
    if (!driverId) {
      skippedNames.push(d.full_name);
      continue;
    }
    matched++;

    for (const ev of d.events) {
      eventRows.push({
        driver_id: driverId,
        event_date: eventDate,
        event_type: ev.event_type,
        severity: ev.severity,
        count: ev.count,
        source: "netradyne",
        raw_data: {
          netradyne_id: d.netradyne_id,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          fleet_name: parsed.fleet_name,
          full_row: d.raw_row,
        },
        imported_from: fileImportId,
      });
    }
  }

  // 5. Wipe prior events for this exact period+source so re-imports cleanly
  //    replace rather than duplicate. The DELETE only affects rows the user
  //    has permission to delete (admin/manager via safety_events_delete RLS).
  const { error: delErr, count: replacedCount } = await supabase
    .from("safety_events")
    .delete({ count: "exact" })
    .eq("source", "netradyne")
    .eq("event_date", eventDate);
  if (delErr) {
    console.error("Pre-import delete failed:", delErr);
    return {
      ok: false,
      error: `Could not clear prior events for re-import: ${delErr.message}`,
    };
  }

  // 6. Bulk insert. Supabase has no hard row-count limit but very large
  //    payloads can hit network limits — chunk if needed. ~5k rows is fine.
  let writtenCount = 0;
  if (eventRows.length > 0) {
    const { error: insErr, count } = await supabase
      .from("safety_events")
      .insert(eventRows, { count: "exact" });
    if (insErr) {
      errors.push({
        driver_name: "(safety_events insert)",
        reason: insErr.message,
      });
    } else {
      writtenCount = count ?? eventRows.length;
    }
  }

  // 7. Update audit row. Skipped names AND fuzzy matches both land in
  //    errors[] for the audit trail even though they're not real errors —
  //    gives the user a place to find the full list if the in-UI sample
  //    isn't enough detail.
  const auditErrors = [
    ...errors,
    ...fuzzyMatched.map((f) => ({
      driver_name: f.netradyne_name,
      reason: `Fuzzy-matched to "${f.matched_to}" (${f.reason})`,
    })),
    ...skippedNames.map((n) => ({
      driver_name: n,
      reason: "Not in this DSP (Netradyne-only — skipped)",
    })),
  ];
  await supabase
    .from("file_imports")
    .update({
      success_count: writtenCount,
      error_count: errors.length, // genuine errors, not the skipped tally
      errors: auditErrors,
    })
    .eq("id", fileImportId);

  // 8. Refresh driver active/inactive status.
  await supabase.rpc("refresh_driver_active_status");

  revalidatePath("/import");
  revalidatePath("/drivers");
  revalidatePath("/");

  return {
    ok: errors.length === 0 || writtenCount > 0,
    error: errors.length > 0 && writtenCount === 0 ? errors[0]?.reason : undefined,
    parsed,
    matched_count: matched,
    created_drivers_count: 0,
    skipped_unknown_count: skippedNames.length,
    skipped_unknown_sample: skippedNames.slice(0, 5),
    fuzzy_matched: fuzzyMatched,
    events_written: writtenCount,
    events_replaced: replacedCount ?? 0,
    errors,
  };
}

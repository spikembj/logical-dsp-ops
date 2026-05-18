"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth/require-role";
import {
  parsePolicyPointsCsv,
  topicAndNotesFor,
  type ParsedPolicyPoint,
  type ParsedPolicyPoints,
} from "@/lib/parsing/policy-points-csv";
import { findFuzzyMatch, normalizeName } from "@/lib/util/name-match";
import {
  findDuplicateImport,
  formatDuplicateError,
  sha256OfBytes,
} from "@/lib/parsing/file-hash";

export interface PolicyPointsImportSummary {
  ok: boolean;
  error?: string;
  parsed_total?: number;
  in_window_count?: number;
  skipped_old_count?: number;
  matched_count?: number;
  fuzzy_matched?: { csv_name: string; matched_to: string; reason: string }[];
  skipped_unknown_count?: number;
  skipped_unknown_sample?: string[];
  inserted_count?: number;
  errors?: { row_index: number; reason: string }[];
}

/**
 * One-off backfill import for the dispatcher's POLICY POINTS CSV.
 *
 * Behavior:
 *   - Filters to rows in the last 90 days (matches the user's retention
 *     policy for active discipline; older rows aren't worth replaying).
 *   - Match strict (normalized "first last" against drivers.full_name);
 *     fall back to fuzzy (nickname dict / first-name prefix / extra-
 *     last-name token) per the existing Netradyne pattern. Skips
 *     unmatched names rather than creating drivers — same policy as
 *     every other non-station-specific import.
 *   - Creates coaching_sessions rows. Session_type maps from the CSV's
 *     "write up" / "record only" / "warning" column. Category maps to
 *     the new policy-point categories (or 'other' if unrecognized).
 *   - File-hash hard-blocks identical re-imports.
 *
 * Intended to be run once. The Log Session dialog handles new write-ups
 * going forward.
 */
export async function importPolicyPointsCsv(
  formData: FormData,
): Promise<PolicyPointsImportSummary> {
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

  let parsed: ParsedPolicyPoints;
  try {
    const text = new TextDecoder("utf-8").decode(bytes);
    parsed = parsePolicyPointsCsv(text);
  } catch (e) {
    console.error("parsePolicyPointsCsv failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse CSV.",
    };
  }

  // Load roster for name matching. Exclude helpers from fuzzy candidates
  // since policy points are about drivers (matches Netradyne pattern).
  const { data: drivers, error: drvErr } = await supabase
    .from("drivers")
    .select("id, full_name, position");
  if (drvErr) return { ok: false, error: `Reading drivers: ${drvErr.message}` };

  const byName = new Map<string, string>();
  const fuzzyCandidates: { id: string; full_name: string }[] = [];
  for (const d of (drivers ?? []) as {
    id: string;
    full_name: string;
    position: string;
  }[]) {
    byName.set(normalizeName(d.full_name), d.id);
    if (d.position === "driver") {
      fuzzyCandidates.push({ id: d.id, full_name: d.full_name });
    }
  }

  // Audit row
  const fileName = file.name || "policy-points.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "policy_points",
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
  const fuzzyMatched: NonNullable<
    PolicyPointsImportSummary["fuzzy_matched"]
  > = [];
  const errors: PolicyPointsImportSummary["errors"] = [];

  type Insert = {
    driver_id: string;
    session_date: string;
    session_type: string;
    topic: string;
    notes: string | null;
    category: string;
    coached_by: string | null;
    acknowledged: boolean;
  };
  const inserts: Insert[] = [];

  for (const row of parsed.rows) {
    const csvName = [row.first_name, row.last_name].filter(Boolean).join(" ");
    let driverId = byName.get(normalizeName(csvName));
    if (!driverId) {
      const fuzzy = findFuzzyMatch(csvName, fuzzyCandidates);
      if (fuzzy) {
        driverId = fuzzy.driverId;
        fuzzyMatched.push({
          csv_name: csvName,
          matched_to: fuzzy.fullName,
          reason: fuzzy.reason,
        });
      }
    }
    if (!driverId) {
      skippedNames.push(csvName);
      continue;
    }
    matched++;

    const { topic, notes } = topicAndNotesFor(row);
    inserts.push({
      driver_id: driverId,
      session_date: row.date,
      session_type: row.session_type,
      topic,
      notes: notes || null,
      category: row.category ?? "other",
      coached_by: user.id,
      acknowledged: false,
    });
  }

  let inserted = 0;
  if (inserts.length > 0) {
    const { error: insErr, count } = await supabase
      .from("coaching_sessions")
      .insert(inserts, { count: "exact" });
    if (insErr) {
      errors.push({ row_index: 0, reason: insErr.message });
    } else {
      inserted = count ?? inserts.length;
    }
  }

  await supabase
    .from("file_imports")
    .update({
      success_count: inserted,
      error_count: errors.length,
      errors,
    })
    .eq("id", fileImportId);

  revalidatePath("/import");
  revalidatePath("/drivers");
  // Refresh every driver-detail Coaching tab whose driver got a new row.
  // Cheap to do globally — Next handles the noop revalidations.
  revalidatePath("/");

  return {
    ok: errors.length === 0 || inserted > 0,
    error:
      errors.length > 0 && inserted === 0 ? errors[0]?.reason : undefined,
    parsed_total: parsed.rows.length + parsed.skipped_old_count,
    in_window_count: parsed.rows.length,
    skipped_old_count: parsed.skipped_old_count,
    matched_count: matched,
    fuzzy_matched: fuzzyMatched,
    skipped_unknown_count: skippedNames.length,
    skipped_unknown_sample: [...new Set(skippedNames)].slice(0, 10),
    inserted_count: inserted,
    errors,
  };
}

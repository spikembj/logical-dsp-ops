"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseNetradyneCsv,
  type ParsedNetradyneReport,
} from "@/lib/parsing/netradyne-csv";

/**
 * Server action: accept an uploaded Netradyne event CSV, parse it, then
 * wipe-and-replace prior safety_events for the same period+source before
 * inserting one row per (driver, event_type) with a non-zero count.
 *
 * Driver matching is by normalized full_name (we don't store Netradyne
 * IDs). Unmatched drivers get auto-created with status=active and no
 * transporter_id (a future scorecard import will populate that).
 */

export interface NetradyneImportSummary {
  ok: boolean;
  error?: string;
  parsed?: ParsedNetradyneReport;
  matched_count?: number;
  created_drivers_count?: number;
  events_written?: number;
  events_replaced?: number;
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

  // 1. Read + parse
  let parsed: ParsedNetradyneReport;
  try {
    const text = await file.text();
    parsed = parseNetradyneCsv(text);
  } catch (e) {
    console.error("parseNetradyneCsv failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not parse CSV.",
    };
  }

  // 2. Pull existing drivers for matching.
  const { data: existing, error: drvErr } = await supabase
    .from("drivers")
    .select("id, full_name");
  if (drvErr) {
    return { ok: false, error: `Reading drivers: ${drvErr.message}` };
  }

  const byName = new Map<string, string>();
  for (const d of existing ?? []) {
    byName.set(normalizeName(d.full_name), d.id);
  }

  // 3. file_imports audit row.
  const fileName = file.name || "netradyne.csv";
  const { data: importRow, error: importErr } = await supabase
    .from("file_imports")
    .insert({
      uploaded_by: user.id,
      import_type: "netradyne",
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

  // 4. Resolve / create driver IDs.
  let createdDrivers = 0;
  let matched = 0;
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
    let driverId: string | undefined = byName.get(normalizeName(d.full_name));

    if (driverId) {
      matched++;
    } else {
      const { data: created, error } = await supabase
        .from("drivers")
        .insert({
          full_name: d.full_name,
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
      byName.set(normalizeName(d.full_name), driverId);
      createdDrivers++;
    }

    for (const ev of d.events) {
      eventRows.push({
        driver_id: driverId!,
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

  // 7. Update audit row.
  await supabase
    .from("file_imports")
    .update({
      success_count: writtenCount,
      error_count: errors.length,
      errors: errors,
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
    created_drivers_count: createdDrivers,
    events_written: writtenCount,
    events_replaced: replacedCount ?? 0,
    errors,
  };
}

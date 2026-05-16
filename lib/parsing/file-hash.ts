import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** SHA256 of file bytes — used to detect re-imports of the same file. */
export function sha256OfBytes(bytes: Uint8Array | ArrayBuffer): string {
  const buf =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes as ArrayBuffer);
  return createHash("sha256").update(buf).digest("hex");
}

export interface DuplicateMatch {
  fileName: string;
  createdAt: string; // ISO timestamp
  importType: string;
}

/**
 * Look for any prior file_imports row with the same SHA256. Returns the
 * earliest match so the error message points at the original upload, not
 * the most recent re-attempt.
 *
 * Block is global across import_type by design — same bytes in two
 * different tabs is almost always a mistake (the underlying CSV/PDF
 * format dictates the import type).
 */
export async function findDuplicateImport(
  supabase: SupabaseClient,
  hash: string,
): Promise<DuplicateMatch | null> {
  const { data, error } = await supabase
    .from("file_imports")
    .select("file_name, created_at, import_type")
    .eq("file_hash", hash)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("findDuplicateImport failed:", error);
    return null; // fail-open: don't block uploads on a query glitch
  }
  if (!data) return null;
  return {
    fileName: data.file_name as string,
    createdAt: data.created_at as string,
    importType: data.import_type as string,
  };
}

/** Friendly, consistent error string for a blocked duplicate upload. */
export function formatDuplicateError(match: DuplicateMatch): string {
  const d = new Date(match.createdAt);
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `This exact file was already imported on ${dateStr} (as "${match.fileName}", import type "${match.importType}"). Rename the file and try again if you really need to re-upload it.`;
}

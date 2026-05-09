import "server-only";
import { createHash } from "node:crypto";

/** SHA256 of file bytes — used to detect re-imports of the same file. */
export function sha256OfBytes(bytes: Uint8Array | ArrayBuffer): string {
  const buf =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes as ArrayBuffer);
  return createHash("sha256").update(buf).digest("hex");
}

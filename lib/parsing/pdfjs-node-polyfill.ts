import "server-only";

/**
 * pdfjs-dist needs three browser globals to compute text positions:
 * DOMMatrix, Path2D, ImageData. Node.js doesn't ship them; @napi-rs/canvas
 * provides Node-compatible implementations via a precompiled native binary.
 *
 * We copy them onto globalThis once, as a side-effect import. Both PDF
 * parsers (scorecard-pdf.ts and pod-details-pdf.ts) import this file at the
 * top, before they dynamically import pdfjs.
 *
 * Idempotent: each global is only assigned if missing, so we don't clobber a
 * native implementation if a future Node version ships these.
 *
 * Why this exists at all: local dev tolerates the missing globals on simple
 * PDFs, but Vercel's stricter serverless Node runtime throws "DOMMatrix is
 * not defined" the moment pdfjs touches one. The polyfill makes prod match
 * dev behavior.
 */

import { DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
  (globalThis as { DOMMatrix: unknown }).DOMMatrix = DOMMatrix;
}
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D: unknown }).Path2D = Path2D;
}
if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
  (globalThis as { ImageData: unknown }).ImageData = ImageData;
}

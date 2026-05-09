import "server-only";
import { amazonWeekEnding } from "@/lib/format/dates";

/**
 * Parser for the Amazon POD (Photo on Delivery) Details PDF.
 *
 * Layout: page 1 = DSP-level summary (we ignore it); pages 2+ are per-DA
 * tables with 13 numeric columns after Name + Transporter ID:
 *   Opportunities, Success, Bypass, Rejects,
 *   Blurry Photo, Package In Car, Package In Hand, Package Too Close,
 *   Photo Too Dark, Human In The Picture, Package Not Clearly Visible,
 *   No Package Detected, Other.
 *
 * Robustness: we locate the transporter ID by regex inside each row, so
 * names with spaces (e.g. "Adriana Salgado melchor" or
 * "Aaron Dallas Pomaville") that pdfjs may emit as multiple text runs
 * still parse cleanly.
 */

export interface ParsedPodDriver {
  full_name: string;
  transporter_id: string;
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
  raw_cells: string[];
}

export interface ParsedPodDetails {
  week: number;
  year: number;
  week_ending: string; // YYYY-MM-DD
  station_code: string | null;
  dsp_name: string | null;
  drivers: ParsedPodDriver[];
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

async function extractTextItems(bytes: Uint8Array): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
    );
  }
  type GetDocOptions = Parameters<typeof pdfjs.getDocument>[0];
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    disableFontFace: true,
  } as GetDocOptions).promise;

  const all: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const txt = await page.getTextContent();
    for (const item of txt.items) {
      if ("str" in item && typeof item.str === "string") {
        all.push({
          str: item.str,
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          page: p,
        });
      }
    }
  }
  return all;
}

function groupRows(items: PdfTextItem[]): PdfTextItem[][] {
  const buckets = new Map<string, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const key = `${it.page}:${Math.round(it.y)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  const sortedKeys = [...buckets.keys()].sort((a, b) => {
    const [ap, ay] = a.split(":").map(Number);
    const [bp, by] = b.split(":").map(Number);
    if (ap !== bp) return ap - bp;
    return by - ay;
  });
  return sortedKeys.map((k) => buckets.get(k)!.sort((a, b) => a.x - b.x));
}

function extractWeekYear(
  rows: PdfTextItem[][],
  fallbackFromFileName?: string,
): {
  week: number;
  year: number;
  station: string | null;
  dsp: string | null;
} {
  let week = 0;
  let year = 0;
  let station: string | null = null;
  let dsp: string | null = null;

  for (const row of rows) {
    const text = row.map((r) => r.str).join(" ");
    if (!week) {
      const m = text.match(/Week\s+(\d+)/i);
      if (m) week = Number(m[1]);
    }
    if (!year) {
      const m = text.match(/\b(20\d{2})\b/);
      if (m) year = Number(m[1]);
    }
    if (!station || !dsp) {
      const m = text.match(/-\s*([A-Z]{2,5})\s*-\s*([A-Z]{2,5}\d?)\s*-/);
      if (m) {
        dsp = m[1];
        station = m[2];
      }
    }
  }

  // The POD Details PDF puts the year only in the filename
  // (e.g. "US-LGCL-DUT7-Week16-2026NA-DA-POD-Details.pdf"), not the page
  // text. Fall back to the filename when the in-PDF text doesn't have it.
  if (!year && fallbackFromFileName) {
    const m = fallbackFromFileName.match(/\b(20\d{2})\b/);
    if (m) year = Number(m[1]);
  }
  if (!week && fallbackFromFileName) {
    const m = fallbackFromFileName.match(/[Ww]eek[-_ ]?(\d+)/);
    if (m) week = Number(m[1]);
  }

  if (!week || !year) {
    throw new Error(
      `Could not locate Week/Year in POD Details PDF (week=${week}, year=${year}).`,
    );
  }
  return { week, year, station, dsp };
}

function isInteger(s: string): boolean {
  return /^-?\d+$/.test(s.trim());
}

function parseDriverRow(cells: string[]): ParsedPodDriver | null {
  // Find the transporter ID cell (A-prefixed, alphanumeric).
  const tidIdx = cells.findIndex((c) => /^A[A-Z0-9]{10,18}$/.test(c.trim()));
  if (tidIdx < 1) return null;

  const transporter_id = cells[tidIdx].trim();
  const nameParts = cells.slice(0, tidIdx).map((c) => c.trim()).filter(Boolean);
  if (nameParts.length === 0) return null;
  const full_name = nameParts.join(" ");

  // Take only purely-numeric cells after the TID (skips any stray text).
  const numericTail = cells
    .slice(tidIdx + 1)
    .map((c) => c.trim())
    .filter(isInteger)
    .map((c) => Number(c));
  if (numericTail.length < 13) return null;

  const m = numericTail;
  return {
    full_name,
    transporter_id,
    opportunities: m[0] ?? 0,
    success: m[1] ?? 0,
    bypass: m[2] ?? 0,
    rejects: m[3] ?? 0,
    blurry_photo: m[4] ?? 0,
    package_in_car: m[5] ?? 0,
    package_in_hand: m[6] ?? 0,
    package_too_close: m[7] ?? 0,
    photo_too_dark: m[8] ?? 0,
    human_in_picture: m[9] ?? 0,
    package_not_clearly_visible: m[10] ?? 0,
    no_package_detected: m[11] ?? 0,
    other_reject: m[12] ?? 0,
    raw_cells: cells,
  };
}

export async function parsePodDetailsPdf(
  bytes: Uint8Array,
  fileName?: string,
): Promise<ParsedPodDetails> {
  const items = await extractTextItems(bytes);
  if (items.length === 0) {
    throw new Error("PDF appears empty (no text content).");
  }

  const rows = groupRows(items);
  const header = extractWeekYear(rows, fileName);

  const drivers: ParsedPodDriver[] = [];
  const seenTids = new Set<string>();
  for (const row of rows) {
    const cells = row.map((c) => c.str);
    const parsed = parseDriverRow(cells);
    if (!parsed) continue;
    if (seenTids.has(parsed.transporter_id)) continue; // dedupe across pages
    seenTids.add(parsed.transporter_id);
    drivers.push(parsed);
  }

  if (drivers.length === 0) {
    throw new Error(
      "Parsed POD Details PDF but found no driver rows. Format may have changed.",
    );
  }

  return {
    week: header.week,
    year: header.year,
    week_ending: amazonWeekEnding(header.week, header.year),
    station_code: header.station,
    dsp_name: header.dsp,
    drivers,
  };
}

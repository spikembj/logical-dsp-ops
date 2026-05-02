import "server-only";

/**
 * Parser for Amazon DSP weekly Scorecard PDFs.
 *
 * The format we target: 9-page PDF with a DSP-level summary on page 3
 * (Week N, Year, Overall Standing) and per-driver tables starting page 4.
 *
 * Per-driver columns (header row, in order):
 *   # | Name | Transporter ID | Delivered | Fico Score |
 *   Seatbelt Off Rate | Speeding Event Rate | Distractions Rate |
 *   Following Distance Rate | Sign/Signal Violations Rate |
 *   CDF DPMO | CED | DCR | DSB | POD | PSB | DSB Count | POD Opps
 *
 * Strategy: extract text items with their (x, y) positions, group by row
 * (close-y), sort within each row by x, and parse the resulting cells.
 * Cells reading "No Data" become null.
 */

import { amazonWeekEnding } from "@/lib/format/dates";

export interface ParsedScorecardDriver {
  row_number: number;
  full_name: string;
  transporter_id: string;
  delivered: number | null;
  fico_score: number | null;
  seatbelt_off_rate: number | null;
  speeding_event_rate: number | null;
  distractions_rate: number | null;
  following_distance_rate: number | null;
  sign_signal_violations_rate: number | null;
  cdf_dpmo: number | null;
  ced: number | null;
  dcr: number | null; // percent, e.g. 99.55
  dsb: number | null;
  pod: number | null; // percent
  psb: number | null;
  dsb_count: number | null;
  pod_opps: number | null;
  /** The raw text cells as they were grouped from the PDF — kept for forensics. */
  raw_cells: string[];
}

export interface ParsedScorecard {
  dsp_name: string | null; // e.g. "LGCL"
  station_code: string | null; // e.g. "DUT7"
  week: number;
  year: number;
  week_ending: string; // YYYY-MM-DD
  overall_standing: string | null; // raw text e.g. "Fantastic Plus"
  drivers: ParsedScorecardDriver[];
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

/** Extract every text item from every page, with x/y coordinates. */
async function extractTextItems(bytes: Uint8Array): Promise<PdfTextItem[]> {
  // Lazy import — the legacy build is the one that runs in Node.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs's TS types are conservative; the runtime accepts these node-friendly
  // options even though they aren't in the public type. Cast via `Parameters`.
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

/** Group items into rows by similar y, then sort each row by x.
 *  Empty / whitespace-only items are dropped — pdfjs emits separator spaces
 *  between every real cell which would otherwise wreck index-based lookups. */
function groupIntoRows(items: PdfTextItem[]): PdfTextItem[][] {
  const byKey = new Map<string, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const key = `${it.page}:${Math.round(it.y)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(it);
  }
  const rows: PdfTextItem[][] = [];
  const sortedKeys = [...byKey.keys()].sort((a, b) => {
    const [ap, ay] = a.split(":").map(Number);
    const [bp, by] = b.split(":").map(Number);
    if (ap !== bp) return ap - bp;
    return by - ay; // higher y = top of page
  });
  for (const k of sortedKeys) {
    rows.push(byKey.get(k)!.sort((a, b) => a.x - b.x));
  }
  return rows;
}

/** Parse a numeric cell. "No Data" / "" → null. Strips % and commas. */
function parseNumericCell(s: string): number | null {
  const t = s.trim();
  if (!t || /^no\s*data$/i.test(t)) return null;
  const cleaned = t.replace(/,/g, "").replace(/%$/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer cell. Same null rules as parseNumericCell. */
function parseIntCell(s: string): number | null {
  const v = parseNumericCell(s);
  if (v === null) return null;
  return Math.round(v);
}

/**
 * Locate "Week N" + year on page 3 (or earlier — the front page also has
 * them). Returns (week, year, dsp_name, station_code).
 */
function extractHeader(rows: PdfTextItem[][]): {
  week: number;
  year: number;
  dsp_name: string | null;
  station_code: string | null;
  overall_standing: string | null;
} {
  let week = 0;
  let year = 0;
  let dspName: string | null = null;
  let station: string | null = null;
  let overall: string | null = null;

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
    if (!dspName || !station) {
      // E.g. "LGCL at DUT7" or "LGCL at DUT7 - Week 16"
      const m = text.match(/^([A-Z]{2,5})\s+at\s+([A-Z]{2,5}\d?)/);
      if (m) {
        dspName = m[1];
        station = m[2];
      }
    }
    if (!overall) {
      // "Overall Standing: 91.1 | Fantastic Plus" — capture the tier label.
      const m = text.match(
        /Overall Standing:\s*[\d.]+\s*\|?\s*(Fantastic\s*Plus|Fantastic|Great|Fair|Poor)/i,
      );
      if (m) overall = m[1].trim();
    }
  }

  if (!week || !year) {
    throw new Error(
      `Could not locate Week / Year in scorecard (week=${week}, year=${year}).`,
    );
  }

  return {
    week,
    year,
    dsp_name: dspName,
    station_code: station,
    overall_standing: overall,
  };
}

/** Detect a per-driver row: starts with an integer rank then a name. */
function isDriverRow(row: PdfTextItem[]): boolean {
  if (row.length < 4) return false;
  const first = row[0].str.trim();
  if (!/^\d+$/.test(first)) return false;
  // Second item should be a person name (letters + spaces, possibly hyphens).
  const second = row[1]?.str.trim() ?? "";
  if (!/^[A-Za-z][A-Za-z .'\-]+/.test(second)) return false;
  return true;
}

/**
 * Some driver rows wrap onto a second visual line for very long names.
 * Detect a continuation row: short (1-2 cells), no leading number, and
 * vertically very close to the previous driver row.
 */
function looksLikeContinuation(
  prevRow: PdfTextItem[],
  thisRow: PdfTextItem[],
): boolean {
  if (!prevRow || !thisRow.length) return false;
  if (prevRow[0]?.page !== thisRow[0]?.page) return false;
  const yDiff = Math.abs(prevRow[0].y - thisRow[0].y);
  if (yDiff > 14) return false;
  // No leading rank number on continuation rows.
  if (/^\d+$/.test(thisRow[0].str.trim())) return false;
  // Continuation rows are short and start near the name column, not at the rank x.
  if (thisRow.length > 3) return false;
  return true;
}

function parseDriverRow(cells: string[]): ParsedScorecardDriver | null {
  // Expected cells (post merge of name continuations):
  // 0: rank
  // 1: name
  // 2: transporter id
  // 3: delivered
  // 4: fico
  // 5..9: 5 safety rates
  // 10: cdf dpmo
  // 11: ced
  // 12: dcr (percent)
  // 13: dsb
  // 14: pod (percent)
  // 15: psb
  // 16: dsb count
  // 17: pod opps

  if (cells.length < 13) return null;
  const rank = parseIntCell(cells[0]);
  if (rank === null) return null;
  const name = cells[1]?.trim();
  const tid = cells[2]?.trim();
  if (!name || !tid) return null;

  // Transporter IDs from the scorecard are short Amazon-style: 13–15 chars,
  // start with 'A', alphanumeric. Bail out if shape doesn't match — protects
  // us against mis-grouped rows.
  if (!/^A[A-Z0-9]{10,18}$/.test(tid)) return null;

  return {
    row_number: rank,
    full_name: name,
    transporter_id: tid,
    delivered: parseIntCell(cells[3] ?? ""),
    fico_score: parseIntCell(cells[4] ?? ""),
    seatbelt_off_rate: parseNumericCell(cells[5] ?? ""),
    speeding_event_rate: parseNumericCell(cells[6] ?? ""),
    distractions_rate: parseNumericCell(cells[7] ?? ""),
    following_distance_rate: parseNumericCell(cells[8] ?? ""),
    sign_signal_violations_rate: parseNumericCell(cells[9] ?? ""),
    cdf_dpmo: parseIntCell(cells[10] ?? ""),
    ced: parseIntCell(cells[11] ?? ""),
    dcr: parseNumericCell(cells[12] ?? ""),
    dsb: parseIntCell(cells[13] ?? ""),
    pod: parseNumericCell(cells[14] ?? ""),
    psb: parseNumericCell(cells[15] ?? ""),
    dsb_count: parseIntCell(cells[16] ?? ""),
    pod_opps: parseIntCell(cells[17] ?? ""),
    raw_cells: cells,
  };
}

export async function parseScorecardPdf(
  bytes: Uint8Array,
): Promise<ParsedScorecard> {
  const items = await extractTextItems(bytes);
  if (items.length === 0) {
    throw new Error(
      "PDF appears empty (no text content). Is this a scanned/image-only PDF?",
    );
  }

  const rows = groupIntoRows(items);
  const header = extractHeader(rows);

  // Walk all rows; collect driver rows, merging name continuations.
  const drivers: ParsedScorecardDriver[] = [];
  let prevDriverRow: PdfTextItem[] | null = null;

  for (const row of rows) {
    if (isDriverRow(row)) {
      const parsed = parseDriverRow(row.map((c) => c.str));
      if (parsed) {
        drivers.push(parsed);
        prevDriverRow = row;
      } else {
        prevDriverRow = null;
      }
    } else if (
      prevDriverRow &&
      looksLikeContinuation(prevDriverRow, row) &&
      drivers.length > 0
    ) {
      // Append the continuation text to the last driver's name.
      const continuation = row
        .map((c) => c.str.trim())
        .filter(Boolean)
        .join(" ");
      if (continuation) {
        const last = drivers[drivers.length - 1];
        last.full_name = `${last.full_name} ${continuation}`.trim();
      }
    } else {
      prevDriverRow = null;
    }
  }

  if (drivers.length === 0) {
    throw new Error(
      `Parsed ${rows.length} rows from PDF but found no driver rows. The format may have changed; check the per-driver column headers.`,
    );
  }

  return {
    ...header,
    week_ending: amazonWeekEnding(header.week, header.year),
    drivers,
  };
}

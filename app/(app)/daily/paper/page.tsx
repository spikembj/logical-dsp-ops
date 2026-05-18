import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/require-role";
import { todayIso, formatSessionDate } from "@/lib/format/dates";
import { getRosterForDate } from "@/lib/queries/daily-ops";
import { formatShowTime } from "@/lib/queries/daily-ops-types";
import { PrintButton } from "@/components/app/daily-ops/print-button";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

/**
 * Printable daily paper view. Server-rendered, minimal CSS, optimized
 * for letter paper. Replaces the "DAILY PAPER" tab the dispatch team
 * was copy/pasting and reformatting from the Google Sheet.
 *
 * Layout matches their existing paper roughly: rows sorted by wave →
 * van, columns Wave / Driver / Van. Date in the header. Dispatcher
 * names left blank (they handwrite if needed; we can fill from EOD
 * data later once that surface lands).
 */
export default async function DailyPaperPage({ searchParams }: PageProps) {
  await requireUser();
  const params = await searchParams;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayIso();

  const roster = await getRosterForDate(date);

  return (
    <div className="space-y-4">
      {/* On-screen controls — hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/daily?date=${date}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to roster
        </Link>
        <PrintButton />
      </div>

      <div className="print-sheet rounded-md border bg-card p-6 print:border-0 print:bg-white print:text-black print:p-0">
        <header className="space-y-1 mb-4 print:mb-2">
          <h1 className="text-2xl font-semibold tracking-tight print:text-xl">
            Daily Paper
          </h1>
          <p className="text-sm text-muted-foreground print:text-black">
            {formatSessionDate(date)} · {roster.length}{" "}
            {roster.length === 1 ? "assignment" : "assignments"}
          </p>
          <p className="text-xs text-muted-foreground print:text-black/70 mt-1">
            Dispatchers: ______________________ / ______________________
          </p>
        </header>

        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No assignments rostered for this day.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground print:text-black">
                <th className="py-2 pr-3 font-normal w-24">Wave</th>
                <th className="py-2 pr-3 font-normal">Driver</th>
                <th className="py-2 pr-3 font-normal">Van</th>
                <th className="py-2 font-normal print:hidden lg:table-cell">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y print:divide-black/30">
              {roster.map((r) => (
                <tr key={r.id} className="break-inside-avoid">
                  <td className="py-1.5 pr-3 tabular-nums">
                    <span className="font-medium">{r.wave}</span>
                    <span className="text-muted-foreground print:text-black/70">
                      {" "}· {formatShowTime(r.show_time)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 font-medium">{r.driver_name}</td>
                  <td className="py-1.5 pr-3">
                    {r.vehicle_name ?? r.vehicle_vin}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground print:hidden lg:table-cell">
                    {r.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

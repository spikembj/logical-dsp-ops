"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { VehicleListItem } from "@/lib/queries/fleet-types";

/**
 * Printable label sheet. Renders one QR + label per vehicle, lays out
 * 4 per row on screen and on paper. CSS print styles hide the controls
 * and make the grid a clean 2×N for letter-size paper.
 */
export function QrSheet({ vehicles }: { vehicles: VehicleListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(vehicles.map((v) => v.vin)),
  );
  const [svgByVin, setSvgByVin] = useState<Map<string, string>>(new Map());

  // Pre-generate SVGs for all selected vans.
  useEffect(() => {
    let cancelled = false;
    const next = new Map<string, string>();
    Promise.all(
      vehicles.map((v) =>
        QRCode.toString(v.vin, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 1,
          width: 200,
        }).then((svg) => {
          next.set(v.vin, svg);
        }),
      ),
    ).then(() => {
      if (!cancelled) setSvgByVin(next);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicles]);

  const visible = useMemo(
    () => vehicles.filter((v) => selected.has(v.vin)),
    [vehicles, selected],
  );

  function toggle(vin: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vin)) next.delete(vin);
      else next.add(vin);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(vehicles.map((v) => v.vin)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  return (
    <>
      {/* Controls — hidden in print */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" onClick={selectAll}>
          Select all
        </Button>
        <Button variant="outline" onClick={clearAll}>
          Clear
        </Button>
        <Button onClick={() => window.print()} className="ml-auto">
          <Printer className="mr-1.5 h-4 w-4" />
          Print {visible.length}
        </Button>
      </div>

      {/* Picker — hidden in print */}
      <div className="rounded-md border print:hidden">
        <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b">
          Include
        </div>
        <ul className="divide-y max-h-72 overflow-y-auto">
          {vehicles.map((v) => (
            <li
              key={v.vin}
              className="px-3 py-1.5 flex items-center gap-3 text-sm"
            >
              <Checkbox
                checked={selected.has(v.vin)}
                onCheckedChange={() => toggle(v.vin)}
                id={`pick-${v.vin}`}
              />
              <label htmlFor={`pick-${v.vin}`} className="cursor-pointer">
                {v.vehicle_name || v.vin}
              </label>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {v.vin}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sheet — visible on screen + print */}
      <div className="qr-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-2 print:gap-2">
        {visible.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground py-8 text-center print:hidden">
            Nothing selected.
          </p>
        ) : (
          visible.map((v) => (
            <div
              key={v.vin}
              className="rounded-md border bg-white p-3 flex flex-col items-center text-black break-inside-avoid"
              style={{ pageBreakInside: "avoid" }}
            >
              <div className="text-sm font-medium text-center">
                {v.vehicle_name || v.vin}
              </div>
              <div
                className="my-2 [&_svg]:w-40 [&_svg]:h-40"
                dangerouslySetInnerHTML={{
                  __html: svgByVin.get(v.vin) ?? "",
                }}
              />
              <div className="font-mono text-[10px] text-neutral-600 break-all text-center">
                {v.vin}
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </>
  );
}

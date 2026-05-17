"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, Download, QrCode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * QR-code popover for a single VIN.
 *
 * `variant="icon"` is the small icon-only button used in the vehicles
 * table; `variant="default"` is the labeled button used in the van
 * detail page header.
 *
 * Encodes the VIN as plain text — directly compatible with Amazon's
 * delivery-app VIN entry. Generation is client-side via the qrcode lib.
 */
export function VehicleQrButton({
  vin,
  name,
  variant = "icon",
  className,
}: {
  vin: string;
  name?: string | null;
  variant?: "icon" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toString(vin, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((e) => console.error("QR generation failed:", e));
    return () => {
      cancelled = true;
    };
  }, [open, vin]);

  function handlePrint() {
    if (!svg) return;
    const w = window.open("", "_blank", "width=420,height=520");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR — ${escapeHtml(
      name ?? vin,
    )}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif;
               display: flex; flex-direction: column; align-items: center;
               padding: 24px; gap: 12px; }
        h1 { font-size: 18px; margin: 0; }
        p { margin: 0; font-family: monospace; font-size: 12px; color: #555; }
        svg { width: 320px; height: 320px; }
      </style>
    </head><body>
      <h1>${escapeHtml(name ?? vin)}</h1>
      ${svg}
      <p>${escapeHtml(vin)}</p>
      <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
    </body></html>`);
    w.document.close();
  }

  function handleDownload() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${vin}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          variant === "icon"
            ? "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            : "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-card hover:bg-muted text-sm transition-colors",
          className,
        )}
        aria-label={`Show QR code for ${name ?? vin}`}
      >
        <QrCode className={variant === "icon" ? "h-4 w-4" : "h-4 w-4"} />
        {variant === "default" && <span>QR</span>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name || vin}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {svg ? (
            <div
              className="bg-white p-3 rounded-md border [&_svg]:w-72 [&_svg]:h-72"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="h-72 w-72 rounded-md bg-muted animate-pulse" />
          )}
          <p className="font-mono text-xs text-muted-foreground select-all">
            {vin}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} disabled={!svg}>
              <Printer className="mr-1.5 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={!svg}>
              <Download className="mr-1.5 h-4 w-4" /> Download SVG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

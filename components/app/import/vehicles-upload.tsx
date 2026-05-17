"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, FileText, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  importVehiclesXlsx,
  type VehiclesImportSummary,
} from "@/app/actions/vehicles-import";
import { cn } from "@/lib/utils";

export function VehiclesUpload() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [summary, setSummary] = useState<VehiclesImportSummary | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Please upload the Amazon Vehicles xlsx file.");
      return;
    }
    setSelected(f);
    setSummary(null);
  }

  function handleSubmit() {
    if (!selected) return;
    const fd = new FormData();
    fd.append("file", selected);
    startTransition(async () => {
      const res = await importVehiclesXlsx(fd);
      setSummary(res);
      if (res.ok) {
        const ins = res.inserted_count ?? 0;
        const upd = res.updated_count ?? 0;
        toast.success(
          `Imported ${ins + upd} van${ins + upd === 1 ? "" : "s"}` +
            (ins > 0 ? ` (${ins} new)` : ""),
        );
        router.refresh();
      } else {
        toast.error(res.error || "Import failed.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-muted-foreground/50",
        )}
      >
        <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm">
          Drop the Vehicles xlsx here, or{" "}
          <label className="text-primary underline-offset-4 hover:underline cursor-pointer">
            browse
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFiles(e.currentTarget.files)}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Amazon Fleet → Export → e.g.{" "}
          <code className="font-mono text-[11px]">VehiclesData.xlsx</code>.
          Locally-edited fields (shop, parking, notes) and manual status
          overrides are preserved across re-imports.
        </p>
      </div>

      {selected && (
        <div className="flex items-center gap-3 rounded-md border bg-card px-4 py-3">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{selected.name}</div>
            <div className="text-xs text-muted-foreground">
              {(selected.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Importing..." : "Import"}
          </Button>
        </div>
      )}

      {summary && summary.ok && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold">Import complete</h3>
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
            <dt className="text-muted-foreground">Vehicles in file</dt>
            <dd>{summary.parsed_count ?? 0}</dd>
            <dt className="text-muted-foreground">New</dt>
            <dd>{summary.inserted_count ?? 0}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{summary.updated_count ?? 0}</dd>
            {!!summary.manual_override_skipped_count && (
              <>
                <dt className="text-muted-foreground">Manual overrides kept</dt>
                <dd>{summary.manual_override_skipped_count}</dd>
              </>
            )}
            {!!summary.grounded_count && (
              <>
                <dt className="text-muted-foreground">Auto-issues opened</dt>
                <dd>{summary.grounded_count}</dd>
              </>
            )}
            {!!summary.ungrounded_count && (
              <>
                <dt className="text-muted-foreground">Auto-issues closed</dt>
                <dd>{summary.ungrounded_count}</dd>
              </>
            )}
            {!!summary.skipped?.length && (
              <>
                <dt className="text-muted-foreground">Rows skipped</dt>
                <dd>{summary.skipped.length}</dd>
              </>
            )}
            {!!summary.errors?.length && (
              <>
                <dt className="text-muted-foreground">Errors</dt>
                <dd className="text-destructive">{summary.errors.length}</dd>
              </>
            )}
          </dl>
          {(summary.skipped?.length || summary.errors?.length) ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show details
              </summary>
              <ul className="mt-2 space-y-1">
                {summary.skipped?.map((s, i) => (
                  <li key={`s${i}`}>
                    <span className="font-medium">Row {s.row_index}:</span>{" "}
                    {s.reason}
                  </li>
                ))}
                {summary.errors?.map((e, i) => (
                  <li key={`e${i}`}>
                    <span className="font-medium">{e.vin}:</span> {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}

      {summary && !summary.ok && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-5 w-5 text-destructive" />
            <h3 className="text-sm font-semibold">Import failed</h3>
          </div>
          <p className="mt-2 text-sm text-destructive">{summary.error}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, FileText, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  importPolicyPointsCsv,
  type PolicyPointsImportSummary,
} from "@/app/actions/policy-points-import";
import { cn } from "@/lib/utils";

export function PolicyPointsUpload() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [summary, setSummary] = useState<PolicyPointsImportSummary | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!/\.csv$/i.test(f.name)) {
      toast.error("Please upload the POLICY POINTS CSV.");
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
      const res = await importPolicyPointsCsv(fd);
      setSummary(res);
      if (res.ok) {
        toast.success(
          `Backfilled ${res.inserted_count ?? 0} coaching session${
            (res.inserted_count ?? 0) === 1 ? "" : "s"
          }.`,
        );
        router.refresh();
      } else {
        toast.error(res.error || "Import failed.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs">
        <strong>One-time backfill.</strong> Imports the last 90 days of
        POLICY POINTS rows into coaching_sessions as write-ups with the
        matching policy category (No Call No Show, Van Damage, etc.).
        Going forward, log new write-ups via the Log session button on
        each driver&rsquo;s Coaching tab. Re-uploading the same file is
        blocked; uploading a different version would duplicate rows.
      </div>

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
          Drop the POLICY POINTS CSV here, or{" "}
          <label className="text-primary underline-offset-4 hover:underline cursor-pointer">
            browse
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFiles(e.currentTarget.files)}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No header row required. Expects 8 columns: date / first / last /
          category / action level / description / consequence / training.
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
            <h3 className="text-sm font-semibold">Backfill complete</h3>
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
            <dt className="text-muted-foreground">Rows in CSV</dt>
            <dd>{summary.parsed_total ?? 0}</dd>
            <dt className="text-muted-foreground">In last 90 days</dt>
            <dd>{summary.in_window_count ?? 0}</dd>
            {!!summary.skipped_old_count && (
              <>
                <dt className="text-muted-foreground">Older than 90 days</dt>
                <dd>{summary.skipped_old_count}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Matched a driver</dt>
            <dd>{summary.matched_count ?? 0}</dd>
            <dt className="text-muted-foreground">Skipped (not in roster)</dt>
            <dd
              title={
                summary.skipped_unknown_sample?.length
                  ? `e.g. ${summary.skipped_unknown_sample.join(", ")}`
                  : undefined
              }
            >
              {summary.skipped_unknown_count ?? 0}
            </dd>
            <dt className="text-muted-foreground">Coaching sessions created</dt>
            <dd className="font-medium">{summary.inserted_count ?? 0}</dd>
            {!!summary.errors?.length && (
              <>
                <dt className="text-muted-foreground">Errors</dt>
                <dd className="text-destructive">{summary.errors.length}</dd>
              </>
            )}
          </dl>

          {!!summary.fuzzy_matched?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {summary.fuzzy_matched.length} fuzzy match
                {summary.fuzzy_matched.length === 1 ? "" : "es"} — verify
              </summary>
              <ul className="mt-2 space-y-1">
                {summary.fuzzy_matched.map((m, i) => (
                  <li key={i}>
                    <span className="font-medium">{m.csv_name}</span> →{" "}
                    {m.matched_to}{" "}
                    <span className="text-muted-foreground">({m.reason})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!!summary.skipped_unknown_sample?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show skipped names
              </summary>
              <ul className="mt-2 space-y-0.5">
                {summary.skipped_unknown_sample.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}

          {!!summary.errors?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show error details
              </summary>
              <ul className="mt-2 space-y-1">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">Row {e.row_index}:</span>{" "}
                    {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
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

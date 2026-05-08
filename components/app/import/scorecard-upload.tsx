"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, FileText, CircleCheck, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importScorecardPdf, type ImportSummary } from "@/app/actions/scorecard-import";
import { cn } from "@/lib/utils";

export function ScorecardUpload() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!/\.pdf$/i.test(f.name)) {
      toast.error("Please upload a PDF file.");
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
      const res = await importScorecardPdf(fd);
      setSummary(res);
      if (res.ok) {
        toast.success(
          `Imported ${res.scorecards_written ?? 0} scorecard${(res.scorecards_written ?? 0) === 1 ? "" : "s"}.`,
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
          Drop the scorecard PDF here, or{" "}
          <label className="text-primary underline-offset-4 hover:underline cursor-pointer">
            browse
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.currentTarget.files)}
            />
          </label>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The Amazon DSP weekly scorecard PDF, e.g.{" "}
          <code className="font-mono text-[11px]">
            US_LGCL_DUT7_Week16_2026_en_DSPScorecard.pdf
          </code>
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

      {summary && summary.ok && summary.parsed && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold">Import complete</h3>
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
            <dt className="text-muted-foreground">DSP</dt>
            <dd>
              {summary.parsed.dsp_name} at {summary.parsed.station_code}
            </dd>
            <dt className="text-muted-foreground">Week</dt>
            <dd>
              Week {summary.parsed.week} {summary.parsed.year} (ending{" "}
              {summary.parsed.week_ending})
            </dd>
            <dt className="text-muted-foreground">Overall standing</dt>
            <dd>{summary.parsed.overall_standing ?? "—"}</dd>
            <dt className="text-muted-foreground">Driver rows</dt>
            <dd>{summary.parsed.drivers.length}</dd>
            <dt className="text-muted-foreground">Matched existing</dt>
            <dd>{summary.matched_count ?? 0}</dd>
            <dt className="text-muted-foreground">New drivers created</dt>
            <dd>{summary.created_drivers_count ?? 0}</dd>
            <dt className="text-muted-foreground">Scorecards written</dt>
            <dd>{summary.scorecards_written ?? 0}</dd>
            {summary.errors && summary.errors.length > 0 && (
              <>
                <dt className="text-muted-foreground">Errors</dt>
                <dd className="text-destructive">{summary.errors.length}</dd>
              </>
            )}
          </dl>
          {summary.errors && summary.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show error details
              </summary>
              <ul className="mt-2 space-y-1">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.driver_name}:</span>{" "}
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

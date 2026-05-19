import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { listCandidateForms } from "@/lib/queries/hr-candidate-forms";

/**
 * List of every candidate-facing form. Clicking one opens its
 * question editor at `/hr/candidates/forms/[slug]`. Adding new form
 * types is intentionally a lower-frequency action — once the
 * interviewee + onboarding forms are dialed in, HR rarely needs to
 * create more. So this page is read-mostly with quick-jump.
 *
 * The question editor is where 95% of the actual editing happens.
 */
export default async function CandidateFormsListPage() {
  await requireManagement();
  const forms = await listCandidateForms();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Candidate forms
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Forms candidates fill out themselves via a per-candidate QR
            code or link. Click a form to manage its questions.
          </p>
        </div>
        <Link
          href="/hr/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to candidates
        </Link>
      </div>

      {forms.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No forms yet.
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y overflow-hidden">
          {forms.map((f) => (
            <li key={f.id}>
              <Link
                href={`/hr/candidates/forms/${f.slug}`}
                className="block px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{f.name}</span>
                      <span className="text-[10px] uppercase tracking-wider rounded bg-muted text-muted-foreground px-1.5 py-0.5 font-mono">
                        {f.slug}
                      </span>
                      {!f.active && (
                        <span className="text-[10px] uppercase tracking-wider rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                          inactive
                        </span>
                      )}
                    </div>
                    {f.description && (
                      <p className="text-xs text-muted-foreground">
                        {f.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        New form types are added via SQL (rare). Existing forms can be
        edited freely — drag questions, toggle active, rename — from the
        per-form editor.
      </p>
    </div>
  );
}

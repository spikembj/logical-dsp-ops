import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import {
  getCandidateFormBySlug,
  listFormQuestions,
} from "@/lib/queries/hr-candidate-forms";
import { FormQuestionsAdmin } from "@/components/app/hr/form-questions-admin";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Per-form question editor. Drag-reorder / rename / Y-N-or-Text /
 * active / delete — same drill as the dispatcher-interview-questions
 * admin from Pass D.
 */
export default async function CandidateFormQuestionsPage({ params }: PageProps) {
  await requireManagement();
  const { slug } = await params;
  const form = await getCandidateFormBySlug(slug);
  if (!form) notFound();
  const questions = await listFormQuestions(form.id);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
          {form.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {form.description}
            </p>
          )}
        </div>
        <Link
          href="/hr/candidates/forms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          All forms
        </Link>
      </div>

      <FormQuestionsAdmin formId={form.id} questions={questions} />
    </div>
  );
}

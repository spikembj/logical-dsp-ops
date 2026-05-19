import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { listInterviewQuestions } from "@/lib/queries/hr-interviews";
import { InterviewQuestionsAdmin } from "@/components/app/hr/interview-questions-admin";

/**
 * Dedicated page for managing the dispatcher interview question list.
 * Reached from the Interview questions button on `/hr/candidates`.
 * Items here appear on every dispatcher's interview form in `/daily`.
 */
export default async function InterviewQuestionsPage() {
  await requireManagement();
  const questions = await listInterviewQuestions(false);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dispatcher interview questions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dispatchers see these questions on every candidate&rsquo;s
            interview form in <code>/daily</code>. Yes/No questions render
            as a tri-state chip; text questions as a textarea.
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

      <InterviewQuestionsAdmin questions={questions} />
    </div>
  );
}

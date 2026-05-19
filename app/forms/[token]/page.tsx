import { getPublicFormByToken } from "@/lib/queries/hr-candidate-forms";
import { IntervieweeForm } from "@/components/app/public/interviewee-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Public candidate form. No auth required — the token in the URL is
 * the credential. Resolves to a candidate + form via the service-role
 * client (see `getPublicFormByToken`); the candidate_id is never
 * exposed to the browser.
 *
 * Bad / expired tokens render a friendly message instead of 404 so
 * candidates without dev experience are not confused by a stack trace.
 */
export default async function PublicFormPage({ params }: PageProps) {
  const { token } = await params;
  const bundle = await getPublicFormByToken(token);

  if (!bundle) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border bg-card p-6 text-center space-y-2">
          <h1 className="text-xl font-semibold">This link is not valid</h1>
          <p className="text-sm text-muted-foreground">
            The form link may have expired or been replaced with a new
            one. Reach out to whoever sent you this link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto py-4">
        <IntervieweeForm
          token={token}
          formName={bundle.form.name}
          candidateName={bundle.candidate_full_name}
          questions={bundle.questions}
          existingAnswers={bundle.answers}
          alreadySubmitted={!!bundle.invitation.submitted_at}
        />
      </div>
    </div>
  );
}

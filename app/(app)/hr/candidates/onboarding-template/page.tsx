import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth/require-role";
import { listOnboardingTemplate } from "@/lib/queries/hr-candidates";
import { OnboardingTemplateAdmin } from "@/components/app/hr/onboarding-template-admin";

/**
 * Dedicated page for managing the onboarding paperwork template.
 * Reached from the Onboarding template button on `/hr/candidates`.
 * Items here surface on the onboarding checklist of every candidate
 * whose status has `is_onboarding=true`.
 */
export default async function OnboardingTemplatePage() {
  await requireManagement();
  const items = await listOnboardingTemplate();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Onboarding checklist template
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paperwork + setup steps every onboarding candidate runs through.
            Drag to reorder; toggle Active off to retire an item without
            losing past completions.
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

      <OnboardingTemplateAdmin items={items} />
    </div>
  );
}

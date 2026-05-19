"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteCandidate } from "@/app/actions/hr-candidates";

/**
 * Small client button extracted so the candidate detail page can stay
 * a server component. The kanban list has the same logic inline in
 * `candidates-list.tsx`; this is the same action wrapped for the
 * detail-page header.
 *
 * After delete, push back to the candidates list since the detail
 * page is about to 404.
 */
export function CandidateDeleteButton({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete ${candidateName}? This removes them entirely — use a status change if you only want to mark them declined.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCandidate({ candidate_id: candidateId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.push("/hr/candidates");
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </button>
  );
}

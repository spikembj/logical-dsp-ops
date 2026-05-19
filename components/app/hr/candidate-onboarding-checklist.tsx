"use client";

import {
  useOptimistic,
  useTransition,
  startTransition as reactStartTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleOnboardingItem } from "@/app/actions/hr-candidates";
import type { OnboardingItemWithCompletion } from "@/lib/queries/hr-candidates-types";

/**
 * Checkbox UI for one candidate's onboarding paperwork. Mirrors the
 * Duties checklist's optimistic pattern: tick the box and the visual
 * state updates instantly, server confirms in the background.
 *
 * Once every active item is checked, a green "Ready to convert" hint
 * appears at the top — the actual Convert-to-driver button lives on
 * the detail page header, gated by the same logic on the server side.
 */
export function CandidateOnboardingChecklist({
  candidateId,
  items,
}: {
  candidateId: string;
  items: OnboardingItemWithCompletion[];
}) {
  const router = useRouter();
  const [, startSavingTransition] = useTransition();

  type Change = { id: string; done: boolean };
  const [optimistic, applyOptimistic] = useOptimistic<
    Map<string, boolean>,
    Change
  >(
    new Map(items.map((i) => [i.id, !!i.completion])),
    (state, change) => {
      const next = new Map(state);
      next.set(change.id, change.done);
      return next;
    },
  );

  function handleToggle(id: string, done: boolean) {
    reactStartTransition(() => applyOptimistic({ id, done }));
    startSavingTransition(async () => {
      const res = await toggleOnboardingItem({
        candidate_id: candidateId,
        template_item_id: id,
        done,
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  const activeItems = items.filter((i) => i.active);
  const totalActive = activeItems.length;
  const completedActive = activeItems.filter((i) => optimistic.get(i.id)).length;
  const allDone = totalActive > 0 && completedActive === totalActive;

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b bg-muted/30 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Onboarding checklist</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {completedActive} / {totalActive}
        </span>
      </header>
      {allDone && (
        <div className="px-4 py-2 border-b bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All set — click <strong>Convert to driver</strong> at the top when
          you are ready.
        </div>
      )}
      {totalActive === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          No active onboarding items. Manage the template on{" "}
          <a href="/hr/candidates" className="underline">
            /hr/candidates
          </a>
          .
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((i) => {
            const checked = !!optimistic.get(i.id);
            return (
              <li
                key={i.id}
                className={
                  "px-4 py-2 flex items-start gap-3" +
                  (i.active ? "" : " opacity-50")
                }
              >
                <Checkbox
                  checked={checked}
                  disabled={!i.active}
                  onCheckedChange={(c) => handleToggle(i.id, Boolean(c))}
                  className="shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={
                      checked
                        ? "text-sm text-muted-foreground line-through"
                        : "text-sm"
                    }
                  >
                    {i.description}
                    {!i.active && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        inactive
                      </span>
                    )}
                  </div>
                  {i.completion && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      ✓ {format(parseISO(i.completion.completed_at), "MMM d, yyyy")}
                      {i.completed_by_name && <> · {i.completed_by_name}</>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

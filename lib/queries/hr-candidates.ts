import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  ArchivedCandidateRow,
  CandidateListItem,
  CandidateOnboardingTemplateItem,
  CandidateRow,
  CandidateStatusColor,
  CandidateStatusRow,
  OnboardingItemWithCompletion,
} from "./hr-candidates-types";

/**
 * Server-only queries for the HR candidates module. Types + pure
 * helpers live in `./hr-candidates-types` so client components can
 * import them without dragging this module into the browser bundle.
 */
export * from "./hr-candidates-types";

/** All candidate statuses (active + inactive), ordered for the UI. */
export const listCandidateStatuses = cache(
  async (): Promise<CandidateStatusRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidate_statuses")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) {
      console.error("listCandidateStatuses failed:", error);
      return [];
    }
    return (data as CandidateStatusRow[]) ?? [];
  },
);

/**
 * Every active candidate (archived rows excluded). Joins the status
 * name + color so cards render without a second lookup, and computes
 * the previously-declined flag per row.
 *
 * Sort: within the page the consumer groups by status_id. Inside a
 * status, candidates are ordered by interview_dt ascending (today /
 * future first), then created_at descending for rows with no
 * interview yet.
 */
export const listActiveCandidates = cache(
  async (): Promise<CandidateListItem[]> => {
    const supabase = await createClient();
    const [candidatesRes, statusesRes] = await Promise.all([
      supabase
        .from("candidates")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      listCandidateStatuses(),
    ]);
    if (candidatesRes.error) {
      console.error("listActiveCandidates failed:", candidatesRes.error);
      return [];
    }

    const statusById = new Map(statusesRes.map((s) => [s.id, s]));
    const candidates = (candidatesRes.data ?? []) as CandidateRow[];

    // Build a map of phone_digits -> most-recent prior declined attempt
    // so we can flag current rows without an extra round-trip per card.
    // We consult every active row plus archived declines from the past.
    const declinedStatusIds = new Set(
      statusesRes.filter((s) => s.treat_as_declined).map((s) => s.id),
    );
    const phonesWithLiveDecline = new Set<string>();
    for (const c of candidates) {
      if (!c.phone_digits) continue;
      if (declinedStatusIds.has(c.status_id)) {
        phonesWithLiveDecline.add(c.phone_digits);
      }
    }
    // For each phone in any active candidate, look up the prior
    // declined record — including archived ones. We pull all declines
    // across the whole DB in one query, then bucket them by phone.
    const activePhones = candidates
      .map((c) => c.phone_digits)
      .filter((p): p is string => !!p);
    type DeclineHit = {
      id: string;
      phone_digits: string;
      created_at: string;
      archived_at: string | null;
      status_id: string;
    };
    let priorDeclines: DeclineHit[] = [];
    if (activePhones.length > 0 && declinedStatusIds.size > 0) {
      const { data: declineData } = await supabase
        .from("candidates")
        .select("id, phone_digits, created_at, archived_at, status_id")
        .in("phone_digits", activePhones)
        .in("status_id", [...declinedStatusIds]);
      priorDeclines = (declineData ?? []) as DeclineHit[];
    }
    // Bucket by phone, sort each bucket by created_at desc.
    const declinesByPhone = new Map<string, DeclineHit[]>();
    for (const d of priorDeclines) {
      const arr = declinesByPhone.get(d.phone_digits) ?? [];
      arr.push(d);
      declinesByPhone.set(d.phone_digits, arr);
    }
    for (const arr of declinesByPhone.values()) {
      arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return candidates.map((c): CandidateListItem => {
      const status = statusById.get(c.status_id);
      let previously_declined = false;
      let previously_declined_at: string | null = null;
      let previously_declined_id: string | null = null;

      if (c.phone_digits) {
        const decs = declinesByPhone.get(c.phone_digits) ?? [];
        // Find the most recent decline that is NOT this row itself, AND
        // that pre-dates it. A candidate currently sitting in DONT HIRE
        // should not flag itself.
        const prior = decs.find(
          (d) => d.id !== c.id && d.created_at < c.created_at,
        );
        if (prior) {
          previously_declined = true;
          previously_declined_at = prior.created_at;
          previously_declined_id = prior.id;
        }
      }

      return {
        ...c,
        status_name: status?.name ?? "Unknown status",
        status_color: (status?.color ?? "slate") as CandidateStatusColor,
        previously_declined,
        previously_declined_at,
        previously_declined_id,
      };
    });
    void phonesWithLiveDecline; // (computed but unused — kept for future "live decline" badge)
  },
);

/**
 * Look up prior declined candidates whose phone matches the given
 * input. Used by the Add Candidate form to surface a warning before
 * the row is created. Returns up to 5 matches, newest first.
 */
export const lookupPriorDeclinesByPhone = cache(
  async (
    phoneDigits: string,
  ): Promise<
    {
      id: string;
      full_name: string;
      created_at: string;
      status_name: string;
    }[]
  > => {
    if (!phoneDigits || phoneDigits.length < 10) return [];
    const supabase = await createClient();
    const { data: statuses } = await supabase
      .from("candidate_statuses")
      .select("id, name")
      .eq("treat_as_declined", true);
    const declinedIds = (statuses ?? []).map((s: { id: string }) => s.id);
    if (declinedIds.length === 0) return [];
    const { data } = await supabase
      .from("candidates")
      .select("id, full_name, created_at, status_id")
      .eq("phone_digits", phoneDigits)
      .in("status_id", declinedIds)
      .order("created_at", { ascending: false })
      .limit(5);
    const statusNameById = new Map(
      (statuses ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
    );
    return ((data ?? []) as { id: string; full_name: string; created_at: string; status_id: string }[]).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      created_at: r.created_at,
      status_name: statusNameById.get(r.status_id) ?? "?",
    }));
  },
);

// ---------------------------------------------------------------------------
// Single-candidate detail + onboarding (Pass C.B)
// ---------------------------------------------------------------------------

/** Full candidate row with the status name + color joined in. */
export const getCandidateById = cache(
  async (
    id: string,
  ): Promise<
    | (CandidateRow & {
        status_name: string;
        status_color: CandidateStatusColor;
        status_is_onboarding: boolean;
      })
    | null
  > => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidates")
      .select(
        `*, status:candidate_statuses ( name, color, is_onboarding )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("getCandidateById failed:", error);
      return null;
    }
    type Joined = CandidateRow & {
      status:
        | { name: string; color: CandidateStatusColor; is_onboarding: boolean }
        | { name: string; color: CandidateStatusColor; is_onboarding: boolean }[]
        | null;
    };
    const row = data as unknown as Joined;
    const status = Array.isArray(row.status) ? row.status[0] : row.status;
    return {
      ...row,
      status_name: status?.name ?? "Unknown",
      status_color: (status?.color ?? "slate") as CandidateStatusColor,
      status_is_onboarding: !!status?.is_onboarding,
    };
  },
);

/** All onboarding template items + this candidate's completion stamps. */
export const getOnboardingChecklistFor = cache(
  async (candidateId: string): Promise<OnboardingItemWithCompletion[]> => {
    const supabase = await createClient();
    const [itemsRes, completionsRes] = await Promise.all([
      supabase
        .from("candidate_onboarding_template_items")
        .select("*")
        .order("sort_order")
        .order("description"),
      supabase
        .from("candidate_onboarding_completion")
        .select(
          `*, completed_by_user:users!candidate_onboarding_completion_completed_by_fkey ( full_name, email )`,
        )
        .eq("candidate_id", candidateId),
    ]);
    if (itemsRes.error) {
      console.error("getOnboardingChecklistFor items:", itemsRes.error);
      return [];
    }
    type CompletionJoined = {
      id: string;
      candidate_id: string;
      template_item_id: string;
      completed_at: string;
      completed_by: string | null;
      completed_by_user:
        | { full_name: string | null; email: string }
        | { full_name: string | null; email: string }[]
        | null;
    };
    const completionByItem = new Map<
      string,
      { completion: CompletionJoined; userName: string | null }
    >();
    for (const c of ((completionsRes.data ?? []) as unknown as CompletionJoined[])) {
      const u = Array.isArray(c.completed_by_user)
        ? c.completed_by_user[0]
        : c.completed_by_user;
      completionByItem.set(c.template_item_id, {
        completion: c,
        userName: u?.full_name ?? u?.email ?? null,
      });
    }
    return ((itemsRes.data ?? []) as CandidateOnboardingTemplateItem[]).map(
      (t) => {
        const hit = completionByItem.get(t.id);
        return {
          ...t,
          completion: hit
            ? {
                id: hit.completion.id,
                candidate_id: hit.completion.candidate_id,
                template_item_id: hit.completion.template_item_id,
                completed_at: hit.completion.completed_at,
                completed_by: hit.completion.completed_by,
              }
            : null,
          completed_by_name: hit?.userName ?? null,
        };
      },
    );
  },
);

/** Every onboarding template item (active + inactive), for the admin panel. */
export const listOnboardingTemplate = cache(
  async (): Promise<CandidateOnboardingTemplateItem[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidate_onboarding_template_items")
      .select("*")
      .order("sort_order")
      .order("description");
    if (error) {
      console.error("listOnboardingTemplate failed:", error);
      return [];
    }
    return (data as CandidateOnboardingTemplateItem[]) ?? [];
  },
);

/**
 * Every archived candidate (hired + declined + manually-archived). Joined
 * with the final status's name/color and a computed outcome bucket.
 * No time window — the user picked "all time" for the default view.
 */
export const listArchivedCandidates = cache(
  async (): Promise<ArchivedCandidateRow[]> => {
    const supabase = await createClient();
    const [candidatesRes, statuses] = await Promise.all([
      supabase
        .from("candidates")
        .select("*")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false }),
      listCandidateStatuses(),
    ]);
    if (candidatesRes.error) {
      console.error("listArchivedCandidates failed:", candidatesRes.error);
      return [];
    }
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    return ((candidatesRes.data ?? []) as CandidateRow[]).map((c) => {
      const s = statusById.get(c.status_id);
      const outcome: ArchivedCandidateRow["outcome"] = c.converted_driver_id
        ? "hired"
        : s?.treat_as_declined
          ? "declined"
          : "other";
      return {
        ...c,
        status_name: s?.name ?? "Unknown",
        status_color: (s?.color ?? "slate") as CandidateStatusColor,
        outcome,
      };
    });
  },
);

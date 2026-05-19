import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  InterviewAnswerRow,
  InterviewQuestion,
  InterviewResponseFull,
  InterviewResponseRow,
  TodaysInterviewRow,
} from "./hr-interviews-types";

/**
 * Server-only queries for the dispatcher interview module. Types live
 * in `./hr-interviews-types` so client components can import them
 * without dragging this module into the browser bundle.
 */
export * from "./hr-interviews-types";

/**
 * Template of dispatcher interview questions. When `activeOnly=true`
 * (default for the form) inactive items are hidden; HR's admin view
 * pulls everything so they can re-enable retired questions.
 */
export const listInterviewQuestions = cache(
  async (activeOnly = true): Promise<InterviewQuestion[]> => {
    const supabase = await createClient();
    let q = supabase
      .from("dispatcher_interview_questions")
      .select("*")
      .order("sort_order")
      .order("prompt");
    if (activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) {
      console.error("listInterviewQuestions failed:", error);
      return [];
    }
    return (data as InterviewQuestion[]) ?? [];
  },
);

type RawResponseJoined = InterviewResponseRow & {
  conducted_by_user:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
  answers:
    | (InterviewAnswerRow & {
        question: InterviewQuestion | InterviewQuestion[] | null;
      })[]
    | null;
};

function flattenOne<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v;
}

/**
 * The candidate's interview response (if any) with every answer + the
 * matching question prompt joined in. Returns null when the dispatcher
 * has not filled the form yet.
 */
export const getInterviewResponseFor = cache(
  async (candidateId: string): Promise<InterviewResponseFull | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dispatcher_interview_responses")
      .select(
        `*,
         conducted_by_user:users!dispatcher_interview_responses_conducted_by_fkey
           ( full_name, email ),
         answers:dispatcher_interview_answers (
           id, response_id, question_id, value_text, value_bool,
           question:dispatcher_interview_questions (
             id, prompt, response_type, sort_order, active,
             created_at, updated_at
           )
         )`,
      )
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (error) {
      console.error("getInterviewResponseFor failed:", error);
      return null;
    }
    if (!data) return null;
    const r = data as unknown as RawResponseJoined;
    const conductor = flattenOne(r.conducted_by_user);
    const answers = (r.answers ?? [])
      .map((a) => ({
        ...a,
        question:
          flattenOne(a.question) ??
          ({
            id: a.question_id,
            prompt: "(deleted question)",
            response_type: "text" as const,
            sort_order: 99999,
            active: false,
            created_at: "",
            updated_at: "",
          } satisfies InterviewQuestion),
      }))
      .sort((a, b) => a.question.sort_order - b.question.sort_order);
    return {
      id: r.id,
      candidate_id: r.candidate_id,
      conducted_by: r.conducted_by,
      conducted_at: r.conducted_at,
      overall_notes: r.overall_notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      conducted_by_name:
        conductor?.full_name ?? conductor?.email ?? null,
      answers,
    };
  },
);

/**
 * Candidates with an interview scheduled on the given local date.
 * Used by the "Today's interviews" section on `/daily`.
 *
 * Dispatcher RLS lets them read candidates with interview_dt in the
 * ±7d window, so this query naturally returns the same rows when the
 * caller is a dispatcher. Management sees everything.
 *
 * `dateIso` is a YYYY-MM-DD string; we build the day's bounds based
 * on the server's local timezone (Vercel uses UTC by default). For a
 * Mountain-Time-only org this would drift up to 6 hours from the
 * user's idea of "today" if Vercel runs in UTC — we accept that here
 * because interviews are scheduled hours-out, not at-midnight, and
 * widening the window by a few hours on each side covers the gap.
 */
export const listTodaysInterviews = cache(
  async (dateIso: string): Promise<TodaysInterviewRow[]> => {
    const supabase = await createClient();
    // Generous window: previous day 18:00 UTC through next day 06:00 UTC
    // covers any reasonable Mountain-Time business day.
    const startIso = `${dateIso}T00:00:00Z`;
    const day = new Date(`${dateIso}T00:00:00Z`);
    const endDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const endIso = endDay.toISOString();

    const { data, error } = await supabase
      .from("candidates")
      .select(
        `id, full_name, phone_display, phone_digits,
         interview_dt, interview_dsp, status_id,
         status:candidate_statuses ( name ),
         response:dispatcher_interview_responses ( id )`,
      )
      .gte("interview_dt", startIso)
      .lt("interview_dt", endIso)
      .is("archived_at", null)
      .order("interview_dt", { ascending: true });
    if (error) {
      console.error("listTodaysInterviews failed:", error);
      return [];
    }
    type Joined = {
      id: string;
      full_name: string;
      phone_display: string | null;
      phone_digits: string | null;
      interview_dt: string;
      interview_dsp: string | null;
      status_id: string;
      status: { name: string } | { name: string }[] | null;
      response: { id: string } | { id: string }[] | null;
    };
    return ((data ?? []) as unknown as Joined[]).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      phone_display: r.phone_display,
      phone_digits: r.phone_digits,
      interview_dt: r.interview_dt,
      interview_dsp: r.interview_dsp,
      status_id: r.status_id,
      status_name: flattenOne(r.status)?.name ?? "Unknown",
      has_response: !!flattenOne(r.response)?.id,
    }));
  },
);

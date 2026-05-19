/**
 * Types + pure helpers for the dispatcher interview module.
 * Client components import these without dragging the server-only
 * query module into the bundle.
 */

export type InterviewResponseType = "yn" | "text";

export interface InterviewQuestion {
  id: string;
  prompt: string;
  response_type: InterviewResponseType;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InterviewResponseRow {
  id: string;
  candidate_id: string;
  conducted_by: string | null;
  conducted_at: string;
  overall_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewAnswerRow {
  id: string;
  response_id: string;
  question_id: string;
  value_text: string | null;
  value_bool: boolean | null;
}

/** Response + every answer + the question prompts joined in. */
export interface InterviewResponseFull extends InterviewResponseRow {
  conducted_by_name: string | null;
  answers: (InterviewAnswerRow & { question: InterviewQuestion })[];
}

/** One row on the "Today's interviews" section of /daily. Light shape
 *  so dispatchers can see the basics without loading every candidate
 *  field. */
export interface TodaysInterviewRow {
  id: string;
  full_name: string;
  phone_display: string | null;
  phone_digits: string | null;
  interview_dt: string;
  interview_dsp: string | null;
  status_id: string;
  status_name: string;
  has_response: boolean;
}

/**
 * Types + pure helpers for the candidate-facing forms module (Pass E).
 * Client components import from here so they do not drag the
 * server-only query module into the bundle.
 */

import type { InterviewResponseType } from "./hr-interviews-types";

/** Re-exported so callers do not need to know the two modules share
 *  the Y/N + text shape. If they diverge in the future, only this
 *  alias has to change. */
export type FormResponseType = InterviewResponseType;

export interface CandidateForm {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CandidateFormQuestion {
  id: string;
  form_id: string;
  prompt: string;
  response_type: FormResponseType;
  sort_order: number;
  active: boolean;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export interface CandidateFormInvitation {
  id: string;
  candidate_id: string;
  form_id: string;
  token: string;
  sent_at: string;
  submitted_at: string | null;
  submitted_ip: string | null;
  submitted_user_agent: string | null;
  created_at: string;
}

export interface CandidateFormAnswer {
  id: string;
  invitation_id: string;
  question_id: string;
  value_text: string | null;
  value_bool: boolean | null;
}

/**
 * Per-form status row used by the HR-side "Candidate forms" card on a
 * candidate's detail page. Joins the form info with this candidate's
 * invitation (if any) and answer count, in one tidy shape.
 */
export interface CandidateFormStatusRow {
  form: CandidateForm;
  invitation: CandidateFormInvitation | null;
  question_count: number;
  answer_count: number;
}

/** A fully-loaded form for the public submission page. */
export interface PublicFormBundle {
  candidate_full_name: string;
  form: CandidateForm;
  questions: CandidateFormQuestion[];
  invitation: CandidateFormInvitation;
  answers: CandidateFormAnswer[];
}

/**
 * 24-char URL-safe random token. Crypto-grade via the global Web Crypto
 * API; runs in both Node and the browser. Alphabet is [A-Za-z0-9_-]
 * (no padding, no ambiguous chars). Collision odds at our scale are
 * effectively zero, but the schema has UNIQUE(token) as a backstop.
 */
export function generateFormToken(): string {
  const bytes = new Uint8Array(18); // 18 bytes → 24 base64url chars
  crypto.getRandomValues(bytes);
  // base64url
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

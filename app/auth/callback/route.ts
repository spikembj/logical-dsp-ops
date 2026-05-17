import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link / invite / recovery callback. Exchanges the PKCE
 * `code` query param for a session cookie, then forwards the user.
 *
 * Routing rules:
 *   - If a `next` query param is set, honor it (server actions like
 *     inviteUser / sendPasswordReset pass `next=/set-password`).
 *   - Otherwise, fall back to `/set-password` for `type=invite`
 *     and `type=recovery` clicks so a fresh sign-up cannot land on the
 *     dashboard without ever setting a password. (Belt-and-suspenders
 *     for any old invite emails sent before redirectTo was wired up.)
 *   - All other flows (magic-link sign-in, OAuth) fall through to `/`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const explicitNext = url.searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const next =
    explicitNext ??
    (type === "invite" || type === "recovery" ? "/set-password" : "/");

  return NextResponse.redirect(new URL(next, url.origin));
}

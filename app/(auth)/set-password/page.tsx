import { SetPasswordClient } from "./set-password-client";

/**
 * Landing page for newly-invited users and password-recovery clicks.
 *
 * The whole flow runs client-side because Supabase's invite/recovery
 * emails use the implicit flow — tokens arrive in the URL hash
 * (#access_token=…&refresh_token=…) which a server-side check
 * can't see. The client component parses the hash, calls
 * supabase.auth.setSession(), then renders the password form.
 *
 * Also handles PKCE-flow links (?code=…) and the case where the user
 * is already signed in (e.g. they want to change their password from
 * a fresh tab) — same form, no session-setting needed.
 */
export default function SetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border bg-card text-card-foreground shadow-sm p-7 space-y-5">
        <SetPasswordClient />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

/**
 * Landing page for newly-invited users and password-recovery clicks.
 *
 * Flow: Supabase verifies the invite/recovery token, hands us back a
 * temporary session via /auth/callback, which forwards here via the
 * `next` query param. We confirm there's a logged-in user, then render
 * the form that calls `updateUser({ password })` to permanently set a
 * password on the account.
 *
 * If someone lands here without a session, send them to login.
 */
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border bg-card text-card-foreground shadow-sm p-7 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Set your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{user.email}</span>.
            Choose a password to finish setting up your account.
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}

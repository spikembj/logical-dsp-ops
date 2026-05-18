"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SetPasswordForm } from "./set-password-form";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; email: string | null }
  | { kind: "invalid"; reason: string };

/**
 * Client-side gate for /set-password. Handles three entry paths:
 *
 *   1. Implicit-flow recovery / invite email: URL hash carries
 *      access_token + refresh_token. Call supabase.auth.setSession.
 *
 *   2. PKCE-flow link: URL has ?code=…. Call
 *      supabase.auth.exchangeCodeForSession.
 *
 *   3. Already signed in (e.g. someone navigates here directly to
 *      change their password). Just show the form.
 *
 * On failure, render a friendly "expired link" message rather than
 * silently bouncing to /login — Manny's earlier confusion came
 * directly from that silent bounce.
 */
export function SetPasswordClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const supabase = createClient();

    async function go() {
      // 1. URL hash — implicit-flow recovery/invite.
      if (typeof window !== "undefined" && window.location.hash.length > 1) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          // Strip the hash either way so a refresh doesn't try again.
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          if (error) {
            setState({
              kind: "invalid",
              reason:
                error.message ?? "This link has expired or already been used.",
            });
            return;
          }
        }
      }

      // 2. PKCE-flow ?code=… — defensive; we redirect straight to
      // /set-password now, but if Supabase ever switches templates
      // this keeps working.
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          url.searchParams.delete("code");
          window.history.replaceState(null, "", url.toString());
          if (error) {
            setState({
              kind: "invalid",
              reason:
                error.message ?? "This link has expired or already been used.",
            });
            return;
          }
        }
      }

      // 3. Check final session.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setState({
          kind: "invalid",
          reason:
            "This link has expired or already been used. Ask your manager to send a fresh password-reset email.",
        });
        return;
      }
      setState({ kind: "ready", email: data.user.email ?? null });
    }

    void go();
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Setting up your account…
        </h1>
        <p className="text-sm text-muted-foreground">
          Hold on a sec while we verify the link.
        </p>
      </div>
    );
  }

  if (state.kind === "invalid") {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Link not valid
          </h1>
          <p className="text-sm text-muted-foreground">{state.reason}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-9 px-3 rounded-md border bg-card hover:bg-muted text-sm transition-colors"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Set your password
        </h1>
        <p className="text-sm text-muted-foreground">
          {state.email ? (
            <>
              Signed in as <span className="font-medium">{state.email}</span>.
              Choose a password to finish setting up your account.
            </>
          ) : (
            "Choose a password to finish setting up your account."
          )}
        </p>
      </div>
      <SetPasswordForm />
    </>
  );
}

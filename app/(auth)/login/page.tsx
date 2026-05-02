import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  // If already signed in and active, skip the form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("active")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.active) {
      redirect("/");
    }
  }

  const params = await searchParams;
  const inactive = params.error === "inactive";
  const next = params.next;

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Logical Ops</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue.</p>
      </div>
      {inactive && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Your account is inactive. Ask an admin to reactivate it.
        </div>
      )}
      <LoginForm next={next ?? "/"} />
    </div>
  );
}

import { requireUser } from "@/lib/auth/require-role";

/**
 * Placeholder dashboard. Build order step 6 replaces this with the real one
 * (summary tiles, "needs coaching" list, "trending down", recent activity).
 */
export default async function DashboardPage() {
  const me = await requireUser();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, {me.full_name ?? me.email}.
        </p>
      </div>
      <div className="rounded-md border p-4 text-sm space-y-2">
        <div>
          <span className="text-muted-foreground">Role:</span>{" "}
          <span className="capitalize">{me.role}</span>
        </div>
        <div>
          <span className="text-muted-foreground">User ID:</span>{" "}
          <code className="text-xs">{me.id}</code>
        </div>
        <p className="text-muted-foreground pt-2">
          The real dashboard ships in build order step&nbsp;6. Drivers list,
          coaching, and CSV import come first.
        </p>
      </div>
    </div>
  );
}

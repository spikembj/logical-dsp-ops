import { requireRole } from "@/lib/auth/require-role";

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Users (admin)</h1>
      <p className="text-sm text-muted-foreground">
        Coming in build order step&nbsp;7.
      </p>
    </div>
  );
}

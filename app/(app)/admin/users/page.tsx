import { requireRole } from "@/lib/auth/require-role";
import { listUsers } from "@/lib/queries/users";
import { UsersAdmin } from "@/components/app/admin/users-table";

export default async function AdminUsersPage() {
  const me = await requireRole(["admin"]);
  const users = await listUsers();
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Invite teammates, set roles, deactivate. Coaching history of a
          deactivated user is preserved.
        </p>
      </div>
      <UsersAdmin users={users} myUserId={me.id} />
    </div>
  );
}

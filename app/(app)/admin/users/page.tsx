import { requireManagement } from "@/lib/auth/require-role";
import { listUsers } from "@/lib/queries/users";
import { listDrivers } from "@/lib/queries/drivers";
import { UsersAdmin } from "@/components/app/admin/users-table";

export default async function AdminUsersPage() {
  const me = await requireManagement();
  const [users, allDrivers] = await Promise.all([listUsers(), listDrivers()]);

  // Drivers eligible for linking: active only, and not already linked to
  // another user. The picker dialog filters from this list.
  const alreadyLinked = new Set(
    users.map((u) => u.driver_id).filter((id): id is string => !!id),
  );
  const linkableDrivers = allDrivers
    .filter((d) => d.status === "active" && !alreadyLinked.has(d.id))
    .map((d) => ({ id: d.id, full_name: d.full_name }));

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Invite teammates, set roles (Owner / HR / Ops Manager /
          Dispatcher), deactivate. Coaching history of a deactivated user is
          preserved. Link a user to a driver record if they also drive
          routes.
        </p>
      </div>
      <UsersAdmin
        users={users}
        myUserId={me.id}
        linkableDrivers={linkableDrivers}
      />
    </div>
  );
}

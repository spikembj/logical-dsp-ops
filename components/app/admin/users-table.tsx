"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Link2Off, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteUser,
  setUserActive,
  setUserDriverLink,
  setUserRole,
} from "@/app/actions/users";
import { formatSessionDate } from "@/lib/format/dates";
import type { UserRole } from "@/lib/types/database";
import type { UserListItem } from "@/lib/queries/users";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "hr", label: "HR" },
  { value: "ops_manager", label: "Ops Manager" },
  { value: "dispatcher", label: "Dispatcher" },
];

/**
 * Render any value (including legacy admin/manager from older rows) cleanly.
 * Maps legacy values to the closest current label.
 */
const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner",
  hr: "HR",
  ops_manager: "Ops Manager",
  dispatcher: "Dispatcher",
  admin: "Owner",
  manager: "Ops Manager",
};

interface LinkableDriver {
  id: string;
  full_name: string;
}

export function UsersAdmin({
  users,
  myUserId,
  linkableDrivers,
}: {
  users: UserListItem[];
  myUserId: string;
  linkableDrivers: LinkableDriver[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {users.length} {users.length === 1 ? "user" : "users"}.
        </p>
        <InviteDialog />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Driver record</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserRowItem
                key={u.id}
                user={u}
                isMe={u.id === myUserId}
                linkableDrivers={linkableDrivers}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UserRowItem({
  user,
  isMe,
  linkableDrivers,
}: {
  user: UserListItem;
  isMe: boolean;
  linkableDrivers: LinkableDriver[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRole(role: UserRole) {
    startTransition(async () => {
      const res = await setUserRole({ user_id: user.id, role });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Role updated to ${ROLE_LABEL[role]}.`);
      router.refresh();
    });
  }
  function handleActive(active: boolean) {
    startTransition(async () => {
      const res = await setUserActive({ user_id: user.id, active });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(active ? "Reactivated." : "Deactivated.");
      router.refresh();
    });
  }
  function handleUnlink() {
    startTransition(async () => {
      const res = await setUserDriverLink({
        user_id: user.id,
        driver_id: null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Driver link removed.");
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.full_name ?? <span className="text-muted-foreground">—</span>}
        {isMe && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            you
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm">{user.email}</TableCell>
      <TableCell>
        <select
          value={user.role}
          onChange={(e) => handleRole(e.currentTarget.value as UserRole)}
          disabled={pending || isMe}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        {user.linked_driver ? (
          <div className="inline-flex items-center gap-1.5 text-sm">
            <Link
              href={`/drivers/${user.linked_driver.id}`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              title="Open driver profile"
            >
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              {user.linked_driver.full_name}
            </Link>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              title="Unlink driver"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <LinkDriverDialog
            userId={user.id}
            userName={user.full_name ?? user.email}
            linkableDrivers={linkableDrivers}
          />
        )}
      </TableCell>
      <TableCell>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={user.active}
            disabled={pending || isMe}
            onChange={(e) => handleActive(e.currentTarget.checked)}
            className="size-4"
          />
          {user.active ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              Active
            </span>
          ) : (
            <span className="text-muted-foreground">Inactive</span>
          )}
        </label>
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
        {formatSessionDate(user.created_at.slice(0, 10))}
      </TableCell>
    </TableRow>
  );
}

/**
 * Picker dialog for linking a user to a driver. Searchable list of active
 * drivers (excluding any already linked to another user — that filter is
 * applied at page-load time and passed in via linkableDrivers).
 */
function LinkDriverDialog({
  userId,
  userName,
  linkableDrivers,
}: {
  userId: string;
  userName: string;
  linkableDrivers: LinkableDriver[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return linkableDrivers.slice(0, 50);
    return linkableDrivers
      .filter((d) => d.full_name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, linkableDrivers]);

  function handleSelect(driverId: string) {
    startTransition(async () => {
      const res = await setUserDriverLink({
        user_id: userId,
        driver_id: driverId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Driver linked.");
      setOpen(false);
      setQuery("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <DialogTrigger className="inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
        <Link2Off className="h-3 w-3" />
        Link…
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link {userName} to a driver record</DialogTitle>
          <DialogDescription>
            Pick the matching driver. Only active drivers not already linked
            to another user appear here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center h-9 w-full rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search drivers"
              autoFocus
              className="flex-1 min-w-0 px-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {linkableDrivers.length === 0
                  ? "No linkable drivers — every active driver is already linked."
                  : "No matches."}
              </p>
            ) : (
              <ul>
                {filtered.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(d.id)}
                      disabled={pending}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    >
                      {d.full_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("dispatcher");

  function reset() {
    setEmail("");
    setFullName("");
    setRole("dispatcher");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await inviteUser({
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invite sent.");
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
        <UserPlus className="h-4 w-4" />
        Invite user
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They&rsquo;ll get an email with a magic link to set their
            password. Sets up their public profile with the role you pick.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.currentTarget.value as UserRole)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

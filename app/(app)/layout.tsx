import Link from "next/link";
import { requireUser } from "@/lib/auth/require-role";
import { SignOutButton } from "@/components/app/sign-out-button";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/drivers", label: "Drivers" },
  { href: "/import", label: "Import" },
];

const ADMIN_NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/drivers", label: "Drivers (admin)" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireUser();
  const showAdmin = me.role === "admin";

  return (
    <div className="min-h-screen grid grid-cols-[14rem_1fr]">
      <aside className="border-r bg-muted/20 p-4 flex flex-col gap-6">
        <div>
          <div className="text-base font-semibold">Logical Ops</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {me.full_name ?? me.email}
            <span className="block opacity-70 capitalize">{me.role}</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-2 py-1.5 rounded hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          {showAdmin && (
            <>
              <div className="mt-3 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Admin
              </div>
              {ADMIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-2 py-1.5 rounded hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <main className="p-6 overflow-x-auto">{children}</main>
    </div>
  );
}

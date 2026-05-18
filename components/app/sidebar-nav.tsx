"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Upload,
  ShieldUser,
  Truck,
  CalendarClock,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Performance", icon: LayoutDashboard, exact: true },
  { href: "/daily", label: "Daily Ops", icon: CalendarClock },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/import", label: "Import", icon: Upload },
];

// Management-only nav. HR lands here too — dispatchers never see it.
const ADMIN_NAV: NavItem[] = [
  { href: "/hr", label: "HR", icon: Briefcase },
  { href: "/admin/users", label: "Management", icon: ShieldUser },
];

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const showAdmin = (
    ["owner", "hr", "ops_manager", "admin", "manager"] as UserRole[]
  ).includes(role);

  return (
    <nav className="px-2 mt-1 flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      {showAdmin && (
        <>
          <div className="mt-4 mb-1 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Manage
          </div>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </>
      )}
    </nav>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

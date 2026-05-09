"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Profile" },
  { href: "/performance", label: "Performance" },
  { href: "/safety-events", label: "Safety events" },
  { href: "/coaching", label: "Coaching" },
];

export function DriverTabs({ driverId }: { driverId: string }) {
  const pathname = usePathname();
  const base = `/drivers/${driverId}`;

  return (
    <nav className="border-b">
      <ul className="flex gap-1 -mb-px">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          const active =
            t.href === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={t.href}>
              <Link
                href={href}
                className={cn(
                  "inline-block px-3 py-2 text-sm border-b-2 transition-colors",
                  active
                    ? "border-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

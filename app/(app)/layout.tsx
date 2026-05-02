import { requireUser } from "@/lib/auth/require-role";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { ThemeToggle } from "@/components/app/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireUser();

  return (
    <div className="min-h-screen grid grid-cols-[15rem_1fr] bg-background">
      <aside className="border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-4 pt-4 pb-3">
          <div className="text-[15px] font-semibold tracking-tight">
            Logical Ops
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
            {me.full_name ?? me.email}
            <span className="block opacity-70 capitalize">{me.role}</span>
          </div>
        </div>

        <SidebarNav role={me.role} />

        <div className="mt-auto border-t border-sidebar-border px-2 py-2 space-y-0.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>
      <main className="px-8 py-6 overflow-x-auto">{children}</main>
    </div>
  );
}

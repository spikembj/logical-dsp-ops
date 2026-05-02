import { requireUser } from "@/lib/auth/require-role";

export default async function DriversPage() {
  await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
      <p className="text-sm text-muted-foreground">
        Coming in build order step&nbsp;2.
      </p>
    </div>
  );
}

import { requireRole } from "@/lib/auth/require-role";

export default async function ImportPage() {
  await requireRole(["admin", "manager"]);
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
      <p className="text-sm text-muted-foreground">
        Scorecard PDF + Netradyne CSV import — build order steps 4 &amp; 5.
      </p>
    </div>
  );
}

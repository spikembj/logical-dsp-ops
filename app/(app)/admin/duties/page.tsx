import { requireManagement } from "@/lib/auth/require-role";
import { listAllDutiesTemplate } from "@/lib/queries/daily-ops";
import { DutiesAdmin } from "@/components/app/daily-ops/duties-admin";

/**
 * Edit the recurring duties template. Add / edit / deactivate / delete
 * items. Deletes cascade to historical completions (drop the item, drop
 * its check history). Inactive items hide from /duties but keep their
 * completion history intact.
 */
export default async function DutiesAdminPage() {
  await requireManagement();
  const items = await listAllDutiesTemplate();
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Duties</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Recurring tasks that appear on the Duties checklist
          (<code className="text-xs">/duties</code>). Daily items split
          into Preload out / Load out / Post / RTS / Closing. Weekly
          items reset Monday (ISO week); monthly resets the 1st. Inactive
          hides without losing history.
        </p>
      </div>
      <DutiesAdmin items={items} />
    </div>
  );
}

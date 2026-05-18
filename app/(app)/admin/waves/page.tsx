import { requireManagement } from "@/lib/auth/require-role";
import { listWaveTimes } from "@/lib/queries/daily-ops";
import { WavesAdmin } from "@/components/app/daily-ops/waves-admin";

/**
 * Edit Amazon wave numbers and show times. Amazon shuffles these maybe
 * twice a year; this surface lets management update them without a
 * code deploy. Inactive waves stay in the table so historical roster
 * rows still join cleanly but they're hidden from the picker.
 */
export default async function WavesPage() {
  await requireManagement();
  const waves = await listWaveTimes();
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wave times</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Amazon wave numbers and their show times. Edit when Amazon
          re-times them. Mark waves <em>inactive</em> instead of deleting
          if any historical roster rows reference them.
        </p>
      </div>
      <WavesAdmin waves={waves} />
    </div>
  );
}

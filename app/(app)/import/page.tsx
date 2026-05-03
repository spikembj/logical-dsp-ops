import { requireRole } from "@/lib/auth/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScorecardUpload } from "@/components/app/import/scorecard-upload";
import { NetradyneUpload } from "@/components/app/import/netradyne-upload";

export default async function ImportPage() {
  await requireRole(["admin", "manager"]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload weekly Amazon scorecards (PDF) and Netradyne event reports
          (CSV).
        </p>
      </div>

      <Tabs defaultValue="scorecard" className="w-full">
        <TabsList>
          <TabsTrigger value="scorecard">Scorecard (PDF)</TabsTrigger>
          <TabsTrigger value="netradyne">Netradyne (CSV)</TabsTrigger>
        </TabsList>
        <TabsContent value="scorecard" className="mt-4">
          <ScorecardUpload />
        </TabsContent>
        <TabsContent value="netradyne" className="mt-4">
          <NetradyneUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}

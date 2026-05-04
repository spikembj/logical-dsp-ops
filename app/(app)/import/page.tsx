import { requireRole } from "@/lib/auth/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScorecardUpload } from "@/components/app/import/scorecard-upload";
import { NetradyneUpload } from "@/components/app/import/netradyne-upload";
import { DspOverviewUpload } from "@/components/app/import/dsp-overview-upload";
import { EscalationsUpload } from "@/components/app/import/escalations-upload";

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

      <Tabs defaultValue="dsp-overview" className="w-full">
        <TabsList>
          <TabsTrigger value="dsp-overview">DSP Overview (CSV)</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard (PDF)</TabsTrigger>
          <TabsTrigger value="netradyne">Netradyne (CSV)</TabsTrigger>
          <TabsTrigger value="escalations">Escalations (CSV)</TabsTrigger>
        </TabsList>
        <TabsContent value="dsp-overview" className="mt-4">
          <DspOverviewUpload />
        </TabsContent>
        <TabsContent value="scorecard" className="mt-4">
          <ScorecardUpload />
        </TabsContent>
        <TabsContent value="netradyne" className="mt-4">
          <NetradyneUpload />
        </TabsContent>
        <TabsContent value="escalations" className="mt-4">
          <EscalationsUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { requireRole } from "@/lib/auth/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScorecardUpload } from "@/components/app/import/scorecard-upload";
import { NetradyneUpload } from "@/components/app/import/netradyne-upload";
import { DspOverviewUpload } from "@/components/app/import/dsp-overview-upload";
import { EscalationsUpload } from "@/components/app/import/escalations-upload";
import { ConcessionsUpload } from "@/components/app/import/concessions-upload";
import { CdfUpload } from "@/components/app/import/cdf-upload";
import { PodDetailsUpload } from "@/components/app/import/pod-details-upload";
import { GlobalDropGuard } from "@/components/app/import/global-drop-guard";

export default async function ImportPage() {
  await requireRole(["admin", "manager"]);

  return (
    <div className="space-y-6 max-w-2xl">
      <GlobalDropGuard />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drop Amazon weekly reports here. New drivers get auto-created;
          existing ones match by transporter ID or name.
        </p>
      </div>

      <Tabs defaultValue="dsp-overview" className="w-full">
        <TabsList>
          <TabsTrigger value="dsp-overview">DSP Overview (CSV)</TabsTrigger>
          <TabsTrigger value="scorecard">Scorecard (PDF)</TabsTrigger>
          <TabsTrigger value="netradyne">Netradyne (CSV)</TabsTrigger>
          <TabsTrigger value="escalations">Escalations (CSV)</TabsTrigger>
          <TabsTrigger value="concessions">Concessions (CSV)</TabsTrigger>
          <TabsTrigger value="cdf">CDF Negative (CSV)</TabsTrigger>
          <TabsTrigger value="pod-details">POD Details (PDF)</TabsTrigger>
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
        <TabsContent value="concessions" className="mt-4">
          <ConcessionsUpload />
        </TabsContent>
        <TabsContent value="cdf" className="mt-4">
          <CdfUpload />
        </TabsContent>
        <TabsContent value="pod-details" className="mt-4">
          <PodDetailsUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}

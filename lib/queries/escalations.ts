import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface EscalationRow {
  id: string;
  driver_id: string;
  bucket: string | null;
  category: string | null;
  behavior: string;
  incident_date: string;
  dsp_notification_date: string | null;
  ack_status: string | null;
  scorecard_week: string | null;
  total_defects_120d: number | null;
  source: string;
  notes: string | null;
  created_at: string;
}

export const listEscalationsForDriver = cache(
  async (driverId: string): Promise<EscalationRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("escalations")
      .select(
        `id, driver_id, bucket, category, behavior, incident_date,
         dsp_notification_date, ack_status, scorecard_week,
         total_defects_120d, source, notes, created_at`,
      )
      .eq("driver_id", driverId)
      .order("incident_date", { ascending: false });
    if (error) {
      console.error("listEscalationsForDriver failed:", error);
      return [];
    }
    return (data ?? []) as EscalationRow[];
  },
);

/**
 * Fetch escalations marked as not yet acknowledged/coached for use by the
 * triggers panel. The CSV's ack_status comes back as "Yes" / "No" /
 * sometimes empty — we treat anything other than a clear yes as open.
 */
export const listOpenEscalationsForDriver = cache(
  async (driverId: string): Promise<EscalationRow[]> => {
    const all = await listEscalationsForDriver(driverId);
    return all.filter((e) => {
      const ack = (e.ack_status ?? "").trim().toLowerCase();
      return ack !== "yes";
    });
  },
);

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Combined per-driver "defects" feed for the Defects tab on the driver
 * detail page. Merges concessions and cdf_negative into a single
 * chronological list. Each item carries a discriminator so the UI can
 * render the right details.
 */

export interface DefectItem {
  kind: "concession" | "cdf";
  id: string;
  date: string;
  tracking_id: string;
  // Concession-specific
  impacts_dsb?: boolean;
  delivery_type?: string | null;
  defect_types?: string[];
  // CDF-specific
  feedback_details?: string | null;
  feedback_types?: string[];
}

export const listDefectsForDriver = cache(
  async (driverId: string): Promise<DefectItem[]> => {
    const supabase = await createClient();
    const [conRes, cdfRes] = await Promise.all([
      supabase
        .from("concessions")
        .select(
          "id, concession_date, tracking_id, impacts_dsb, delivery_type, defect_types",
        )
        .eq("driver_id", driverId)
        .order("concession_date", { ascending: false }),
      supabase
        .from("cdf_negative")
        .select(
          "id, delivery_date, tracking_id, feedback_details, feedback_types",
        )
        .eq("driver_id", driverId)
        .order("delivery_date", { ascending: false }),
    ]);

    const items: DefectItem[] = [];
    for (const c of conRes.data ?? []) {
      items.push({
        kind: "concession",
        id: c.id as string,
        date: c.concession_date as string,
        tracking_id: c.tracking_id as string,
        impacts_dsb: c.impacts_dsb as boolean,
        delivery_type: (c.delivery_type as string | null) ?? null,
        defect_types: (c.defect_types as string[]) ?? [],
      });
    }
    for (const c of cdfRes.data ?? []) {
      items.push({
        kind: "cdf",
        id: c.id as string,
        date: c.delivery_date as string,
        tracking_id: c.tracking_id as string,
        feedback_details: (c.feedback_details as string | null) ?? null,
        feedback_types: (c.feedback_types as string[]) ?? [],
      });
    }

    items.sort((a, b) => (a.date < b.date ? 1 : -1));
    return items;
  },
);

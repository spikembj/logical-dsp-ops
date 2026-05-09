import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface PodDetailsRow {
  id: string;
  driver_id: string;
  week_ending: string;
  opportunities: number;
  success: number;
  bypass: number;
  rejects: number;
  blurry_photo: number;
  package_in_car: number;
  package_in_hand: number;
  package_too_close: number;
  photo_too_dark: number;
  human_in_picture: number;
  package_not_clearly_visible: number;
  no_package_detected: number;
  other_reject: number;
}

const COLS =
  "id, driver_id, week_ending, opportunities, success, bypass, rejects, " +
  "blurry_photo, package_in_car, package_in_hand, package_too_close, " +
  "photo_too_dark, human_in_picture, package_not_clearly_visible, " +
  "no_package_detected, other_reject";

/** Most recent POD details row for a driver, if any. */
export const getLatestPodDetails = cache(
  async (driverId: string): Promise<PodDetailsRow | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pod_details")
      .select(COLS)
      .eq("driver_id", driverId)
      .order("week_ending", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as PodDetailsRow;
  },
);

/**
 * Return the reject categories with non-zero counts on the latest POD row,
 * sorted by count desc. Empty array if none.
 */
export function podRejectBreakdown(
  row: PodDetailsRow,
): { label: string; count: number }[] {
  const cats: { label: string; count: number }[] = [
    { label: "No package detected", count: row.no_package_detected },
    {
      label: "Package not clearly visible",
      count: row.package_not_clearly_visible,
    },
    { label: "Package too close", count: row.package_too_close },
    { label: "Blurry photo", count: row.blurry_photo },
    { label: "Package in car", count: row.package_in_car },
    { label: "Package in hand", count: row.package_in_hand },
    { label: "Photo too dark", count: row.photo_too_dark },
    { label: "Human in picture", count: row.human_in_picture },
    { label: "Other", count: row.other_reject },
  ];
  return cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}

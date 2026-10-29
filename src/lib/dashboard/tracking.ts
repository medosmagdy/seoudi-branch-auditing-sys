import { supabase } from "@/integrations/supabase/client";
import type { TrackingRecord } from "@/integrations/supabase/app-schema";
import { TRACKING_STATUSES, type MonthlyTrackingRow, type TrackingField } from "./tracking-model";
export { mergeTrackingAudits } from "./tracking-model";

// Viewing tracking is read-only. Managers can view real audits even when no
// manual tracking rows have been initialized by an administrator.
export async function fetchMonthlyTracking(
  month: string,
  signal?: AbortSignal,
): Promise<TrackingRecord[]> {
  const rows: TrackingRecord[] = [];
  for (let from = 0; ; from += 500) {
    signal?.throwIfAborted();
    let request = supabase
      .from("monthly_branch_tracking")
      .select("*")
      .eq("tracking_month", month)
      .order("branch_name")
      .order("id")
      .range(from, from + 499);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    signal?.throwIfAborted();
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function updateMonthlyTracking(
  row: MonthlyTrackingRow,
  field: TrackingField,
  value: string,
  month: string,
) {
  if (
    !TRACKING_STATUSES.includes(value as (typeof TRACKING_STATUSES)[number]) ||
    !["fs_status", "ghp_status", "fsms_status"].includes(field)
  )
    throw new Error("حالة المتابعة غير صحيحة");
  if (!row.branch_id || row.tracking_month !== month)
    throw new Error("بيانات الفرع أو الشهر غير متطابقة؛ حدّث الصفحة");
  const program = field.replace("_status", "").toUpperCase() as "FS" | "GHP" | "FSMS";
  const count = row.audit_counts?.[program];
  if (count && count.submitted + count.drafts > 0)
    throw new Error("حالة هذا البرنامج محسوبة تلقائيًا من الفحوصات");
  const updated_at = new Date().toISOString();
  const patch = {
    [field]: value,
    [`${field.replace("_status", "")}_updated_at`]: updated_at,
    updated_at,
  } as Partial<TrackingRecord>;
  const request =
    row.persisted === false
      ? supabase
          .from("monthly_branch_tracking")
          .insert({
            branch_id: row.branch_id,
            branch_name: row.branch_name,
            tracking_month: month,
            ...patch,
          })
      : supabase
          .from("monthly_branch_tracking")
          .update(patch)
          .eq("id", row.id)
          .eq("tracking_month", month);
  const { error } = await request.select("id").single();
  if (error) throw error;
}

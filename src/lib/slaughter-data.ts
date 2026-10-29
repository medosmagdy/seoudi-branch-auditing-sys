import { supabase } from "@/integrations/supabase/client";

// The deployed table has no slaughtering_evaluation column. New scores live in
// report_details.score, and historical reports fall back to meat_score.
export const SLAUGHTER_REPORT_FIELDS =
  "id, report_date, farm_name, slaughterhouse_name, animal_type, total_count, received_count, rejected_count, carcass_weight, meat_score, rejection_reason, status, report_details";

export async function loadSlaughterReports() {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await (supabase as any)
      .from("slaughter_reports")
      .select(SLAUGHTER_REPORT_FIELDS)
      .order("report_date", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}

export function saveSlaughterReport(payload: Record<string, unknown>, id?: string) {
  if (id) {
    const { created_by: _creator, ...update } = payload;
    return (supabase as any)
      .from("slaughter_reports")
      .update(update)
      .eq("id", id)
      .eq("status", "draft")
      .select(SLAUGHTER_REPORT_FIELDS)
      .single();
  }
  return (supabase as any)
    .from("slaughter_reports")
    .insert(payload)
    .select(SLAUGHTER_REPORT_FIELDS)
    .single();
}

export async function deleteSlaughterReport(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    throw new Error("لا يمكن حذف تقرير الأرشيف المحلي");
  const { data: photos, error: photoError } = await (supabase as any)
    .from("slaughter_report_photos")
    .select("storage_path")
    .eq("report_id", id);
  if (photoError) throw new Error("تعذر تحميل صور التقرير؛ لم يتم الحذف");
  const paths = (photos ?? []).map((photo: { storage_path: string }) => photo.storage_path);
  if (paths.some((path: string) => !path.startsWith(`slaughter/${id}/`) || path.includes("..")))
    throw new Error("مسار صور التقرير غير صالح");
  if (paths.length) {
    const { error } = await supabase.storage.from("audit-reports").remove(paths);
    if (error) throw new Error("تعذر حذف صور التقرير؛ أعد المحاولة");
  }
  const { error } = await (supabase as any)
    .from("slaughter_reports")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error("تعذر حذف سجل التقرير؛ أعد المحاولة");
}

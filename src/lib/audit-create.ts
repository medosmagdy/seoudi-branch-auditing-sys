import { supabase } from "@/integrations/supabase/client";

/** Retry one creation request using the same UUID; reconcile a lost successful response. */
export async function insertAuditOnce(
  payload: Record<string, unknown> & { id: string; auditor_id: string },
  auditorName: string,
) {
  let response = await supabase
    .from("audits")
    .insert(payload as never)
    .select("id")
    .single();
  if (response.error?.message.includes("auditor_name")) {
    response = await supabase
      .from("audits")
      .insert({ ...payload, auditor_name: auditorName } as never)
      .select("id")
      .single();
  }
  if (response.error) {
    const existing = await supabase
      .from("audits")
      .select("id")
      .eq("id", payload.id)
      .eq("auditor_id", payload.auditor_id)
      .maybeSingle();
    if (existing.data) return existing.data.id;
    throw response.error;
  }
  if (!response.data?.id) throw new Error("لم يتم إنشاء الفحص بنجاح");
  return response.data.id;
}

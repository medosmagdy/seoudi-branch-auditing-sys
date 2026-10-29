import { supabase } from "@/integrations/supabase/client";

type DeductionScope = { auditId: string; sectionId?: string };

export async function addAuditDeduction(scope: DeductionScope, reason: string, percentage: number) {
  const reasonText = reason.trim().slice(0, 300);
  if (!reasonText || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100)
    throw new Error("أدخل سبب الخصم ونسبة بين 1 و 100%");
  const payload = { audit_id: scope.auditId, reason_text: reasonText, percentage };
  const response = scope.sectionId
    ? await supabase
        .from("audit_section_deductions")
        .insert({ ...payload, section_id: scope.sectionId })
        .select("id")
        .single()
    : await supabase.from("audit_general_deductions").insert(payload).select("id").single();
  if (response.error) throw response.error;
  if (!response.data) throw new Error("لم يتم تأكيد حفظ الخصم");
}

export async function removeAuditDeduction(scope: DeductionScope, deductionId: string) {
  const response = scope.sectionId
    ? await supabase
        .from("audit_section_deductions")
        .delete()
        .eq("id", deductionId)
        .eq("audit_id", scope.auditId)
        .eq("section_id", scope.sectionId)
        .select("id")
        .single()
    : await supabase
        .from("audit_general_deductions")
        .delete()
        .eq("id", deductionId)
        .eq("audit_id", scope.auditId)
        .select("id")
        .single();
  if (response.error) throw response.error;
  if (!response.data) throw new Error("لم يتم تأكيد حذف الخصم");
}

import { supabase } from "@/integrations/supabase/client";

export async function logAuditEdit(auditId: string, action: string, detail: string) {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!data.user) throw new Error("تعذر توثيق التعديل بدون مستخدم مسجل");
  const { data: saved, error } = await supabase
    .from("audit_edit_logs")
    .insert({
      audit_id: auditId,
      user_id: data.user.id,
      action: action.slice(0, 80),
      detail: detail.slice(0, 500),
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!saved) throw new Error("لم يتم تأكيد حفظ سجل التعديل");
}

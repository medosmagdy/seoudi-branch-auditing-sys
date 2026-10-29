import { supabase } from "@/integrations/supabase/client";

/** Fetch only this program's answers, without silently stopping at the API row cap. */
export async function loadAuditAnswers(auditId: string, auditTypeId: string) {
  const rows: {
    question_id: string;
    score: number | null;
    is_na: boolean;
    comment: string | null;
  }[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("audit_answers")
      .select("question_id, score, is_na, comment, questions!inner(audit_type_id)")
      .eq("audit_id", auditId)
      .eq("questions.audit_type_id", auditTypeId)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

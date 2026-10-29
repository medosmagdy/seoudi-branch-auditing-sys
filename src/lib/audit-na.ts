import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./query-pages";
export type NaAnswer = {
  question_id: string;
  score: number | null;
  is_na: boolean;
  comment: string | null;
};
export type NaStatus = { section_id: string; is_na: boolean };
export type NaDefaults = { answers: NaAnswer[]; statuses: NaStatus[] };
type AuditContext = {
  id: string;
  branch_id: string;
  audit_type_id: string;
  audit_date: string;
  created_at?: string | null;
  status: string;
};

/** Current entries always win per item, including explicit false and a zero score. */
export function mergeAuditDefaults<T>(defaults: T[], saved: T[], key: (row: T) => string): T[] {
  const rows = new Map(defaults.map((row) => [key(row), row]));
  for (const row of saved) rows.set(key(row), row);
  return [...rows.values()];
}
export async function loadAuditNaDefaults(audit: AuditContext): Promise<NaDefaults> {
  if (audit.status !== "draft") return { answers: [], statuses: [] };
  let previous = supabase
    .from("audits")
    .select("id")
    .eq("branch_id", audit.branch_id)
    .eq("audit_type_id", audit.audit_type_id)
    .neq("id", audit.id)
    .lte("audit_date", audit.audit_date);
  if (audit.created_at) previous = previous.lt("created_at", audit.created_at);
  const { data, error } = await previous
    .order("audit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { answers: [], statuses: [] };
  const [answers, statuses] = await Promise.all([
    readAllPages((from, to) =>
      supabase
        .from("audit_answers")
        .select("question_id, score, is_na, comment, questions!inner(audit_type_id, active)")
        .eq("audit_id", data.id)
        .eq("questions.audit_type_id", audit.audit_type_id)
        .eq("questions.active", true)
        .eq("is_na", true)
        .order("id")
        .range(from, to),
    ),
    readAllPages((from, to) =>
      supabase
        .from("audit_section_status")
        .select("section_id, is_na, sections!inner(audit_type_id, active)")
        .eq("audit_id", data.id)
        .eq("sections.audit_type_id", audit.audit_type_id)
        .eq("sections.active", true)
        .eq("is_na", true)
        .order("id")
        .range(from, to),
    ),
  ]);
  return { answers, statuses };
}

/** Used only by explicit save/summary actions. Never overwrites an answer already saved by the user. */
export async function saveAuditNaDefaults(auditId: string, defaults: NaDefaults) {
  if (defaults.answers.length) {
    const { error } = await supabase.from("audit_answers").upsert(
      defaults.answers.map((row) => ({
        audit_id: auditId,
        question_id: row.question_id,
        is_na: true,
        score: null,
        comment: row.comment,
      })),
      { onConflict: "audit_id,question_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  if (defaults.statuses.length) {
    const { error } = await supabase.from("audit_section_status").upsert(
      defaults.statuses.map((row) => ({
        audit_id: auditId,
        section_id: row.section_id,
        is_na: row.is_na,
      })),
      { onConflict: "audit_id,section_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

export async function initializeAuditNa(auditId: string) {
  const { data, error } = await supabase
    .from("audits")
    .select("id, branch_id, audit_type_id, audit_date, created_at, status")
    .eq("id", auditId)
    .single();
  if (error) throw error;
  await saveAuditNaDefaults(auditId, await loadAuditNaDefaults(data));
}

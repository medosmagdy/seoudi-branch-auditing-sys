import { supabase } from "@/integrations/supabase/client";
import {
  matchesAuditTypeScope,
  matchesLocationScope,
  type LocationScope,
} from "@/lib/location-scope";
import type { AuditAnswerRow } from "@/lib/dashboard/types";

export async function fetchDashboardData(scope: LocationScope) {
  const [
    auditsRes,
    branchesRes,
    sectionsRes,
    questionsRes,
    answersRes,
    auditTypesRes,
    profilesRes,
  ] = await Promise.all([
    supabase.from("audits").select("*").order("audit_date", { ascending: false }),
    supabase.from("branches").select("*").order("name_ar"),
    supabase.from("sections").select("*").order("order_index"),
    supabase.from("questions").select("*"),
    fetchAllAuditAnswers(),
    supabase.from("audit_types").select("*"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const branches = (branchesRes.data ?? []).filter((branch) => matchesLocationScope(branch, scope));
  const auditTypes = (auditTypesRes.data ?? []).filter((type) =>
    matchesAuditTypeScope(type, scope),
  );
  const profiles = profilesRes.data ?? [];
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
  const typeMap = new Map(auditTypes.map((type) => [type.id, type]));
  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile.full_name || profile.email || "—"]),
  );
  const branchIds = new Set(branches.map((branch) => branch.id));
  const auditTypeIds = new Set(auditTypes.map((type) => type.id));

  const audits = (auditsRes.data ?? [])
    .filter(
      (audit) =>
        audit.branch_id && branchIds.has(audit.branch_id) && auditTypeIds.has(audit.audit_type_id),
    )
    .map((audit) => ({
      ...audit,
      branchName: branchMap.get(audit.branch_id)?.name_ar || "فرع غير مسجل",
      branchCode: branchMap.get(audit.branch_id)?.code || "—",
      typeName: typeMap.get(audit.audit_type_id)?.name_ar || "سلامة الغذاء",
      typeCode: typeMap.get(audit.audit_type_id)?.code || "FS",
      auditorName: profileMap.get(audit.auditor_id) || "—",
    }));

  return {
    audits,
    branches,
    sections: sectionsRes.data ?? [],
    questions: questionsRes.data ?? [],
    answers: answersRes.data ?? [],
    auditTypes,
    profiles,
  };
}

async function fetchAllAuditAnswers(): Promise<{ data: AuditAnswerRow[]; error: null }> {
  const pageSize = 1000;
  const rows: AuditAnswerRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from("audit_answers")
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }

  return { data: rows, error: null };
}

export type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>;

import { readAnswerPages } from "./answer-pages";
import { dashboardProgram } from "./snapshot";
import type { DashboardProgram } from "./metrics";
import { supabase } from "@/integrations/supabase/client";
import {
  matchesAuditTypeScope,
  matchesLocationScope,
  type LocationScope,
} from "@/lib/location-scope";
import type {
  DashboardAnswer,
  AuditRow,
  BranchRow,
  AuditTypeRow,
  SectionRow,
  QuestionRow,
} from "./types";

export type DetailFilters = {
  start: string;
  end: string;
  branch: string;
  includeAnswers?: boolean;
  program?: DashboardProgram | "all";
  submittedOnly?: boolean;
  allowedBranchIds?: readonly string[] | null;
};

async function pages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

export async function fetchDashboardData(
  scope: LocationScope,
  filters: DetailFilters = { start: "", end: "", branch: "all" },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const [allBranches, allTypes, profilesRes] = await Promise.all([
    pages<BranchRow>((from, to) =>
      supabase.from("branches").select("*").order("id").range(from, to),
    ),
    pages<AuditTypeRow>((from, to) =>
      supabase.from("audit_types").select("*").order("id").range(from, to),
    ),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  signal?.throwIfAborted();
  const branches = allBranches.filter(
    (branch) =>
      matchesLocationScope(branch, scope) &&
      (filters.allowedBranchIds == null || filters.allowedBranchIds.includes(branch.id)),
  );
  const auditTypes = allTypes.filter(
    (type) =>
      matchesAuditTypeScope(type, scope) &&
      (!filters.program || filters.program === "all" || dashboardProgram(type) === filters.program),
  );
  const typeIds = auditTypes.map((t) => t.id);
  const branchIds = branches
    .filter((b) => filters.branch === "all" || b.id === filters.branch)
    .map((b) => b.id);
  const [auditRows, sections, questions] =
    typeIds.length && branchIds.length
      ? await Promise.all([
          pages<AuditRow>((from, to) => {
            let query = supabase
              .from("audits")
              .select("*")
              .in("branch_id", branchIds)
              .in("audit_type_id", typeIds);
            if (filters.submittedOnly) query = query.eq("status", "submitted");
            if (filters.start) query = query.gte("audit_date", filters.start);
            if (filters.end) query = query.lte("audit_date", filters.end);
            if (signal) query = query.abortSignal(signal);
            return query.order("audit_date", { ascending: false }).order("id").range(from, to);
          }),
          pages<SectionRow>((from, to) =>
            supabase
              .from("sections")
              .select("*")
              .in("audit_type_id", typeIds)
              .eq("active", true)
              .order("order_index")
              .order("id")
              .range(from, to),
          ),
          pages<QuestionRow>((from, to) =>
            supabase
              .from("questions")
              .select("*")
              .in("audit_type_id", typeIds)
              .eq("active", true)
              .order("id")
              .range(from, to),
          ),
        ])
      : [[], [], []];
  signal?.throwIfAborted();
  const profiles = profilesRes.data ?? [];
  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const typeMap = new Map(auditTypes.map((t) => [t.id, t]));
  const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));
  const audits = auditRows.map((audit) => ({
    ...audit,
    branchName: branchMap.get(audit.branch_id)?.name_ar || "فرع غير مسجل",
    branchCode: branchMap.get(audit.branch_id)?.code || "—",
    typeName: typeMap.get(audit.audit_type_id)?.name_ar || "سلامة الغذاء",
    typeCode: typeMap.get(audit.audit_type_id)?.code || "FS",
    auditorName: profileMap.get(audit.auditor_id) || "—",
  }));
  let answers: DashboardAnswer[] = [];
  if (filters.includeAnswers !== false && auditRows.length) {
    const [loaded, excluded] = await Promise.all([
      loadScopedAnswers(auditRows, signal),
      loadExcludedSections(auditRows, signal),
    ]);
    const activeSections = new Set(sections.map((s) => s.id));
    const questionMap = new Map(
      questions.filter((q) => activeSections.has(q.section_id)).map((q) => [q.id, q]),
    );
    answers = loaded.filter((answer) => {
      const question = questionMap.get(answer.question_id);
      return (
        question &&
        !excluded.has(`${answer.audit_id}:${question.section_id}`) &&
        (answer.is_na || answer.score !== null)
      );
    });
  }
  signal?.throwIfAborted();
  return { audits, branches, sections, questions, answers, auditTypes, profiles };
}

async function loadExcludedSections(auditRows: AuditRow[], signal?: AbortSignal) {
  const excluded = new Set<string>();
  for (let offset = 0; offset < auditRows.length; offset += 40) {
    const ids = auditRows.slice(offset, offset + 40).map((a) => a.id);
    const statuses = await pages<{ audit_id: string; section_id: string }>((from, to) => {
      let query = supabase
        .from("audit_section_status")
        .select("audit_id, section_id")
        .in("audit_id", ids)
        .eq("is_na", true)
        .order("id")
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return query;
    });
    for (const status of statuses) excluded.add(`${status.audit_id}:${status.section_id}`);
  }
  return excluded;
}

async function loadScopedAnswers(
  audits: AuditRow[],
  signal?: AbortSignal,
): Promise<DashboardAnswer[]> {
  const groups = new Map<string, string[]>();
  for (const audit of audits) {
    const ids = groups.get(audit.audit_type_id) ?? [];
    ids.push(audit.id);
    groups.set(audit.audit_type_id, ids);
  }
  const entries = [...groups];
  const rows: DashboardAnswer[] = [];
  // Bound concurrency; never request answers outside the selected visits/program.
  for (let index = 0; index < entries.length; index += 3) {
    const batches = await Promise.all(
      entries.slice(index, index + 3).map(async ([typeId, auditIds]) => {
        const result: DashboardAnswer[] = [];
        for (let offset = 0; offset < auditIds.length; offset += 40) {
          signal?.throwIfAborted();
          result.push(
            ...(await readAnswerPages<DashboardAnswer>(
              (from, to, count) => {
                let query = supabase
                  .from("audit_answers")
                  .select(
                    "id, audit_id, question_id, score, is_na, comment, questions!inner(audit_type_id)",
                    count ? { count: "exact" } : {},
                  )
                  .in("audit_id", auditIds.slice(offset, offset + 40))
                  .eq("questions.audit_type_id", typeId)
                  .order("id")
                  .range(from, to);
                if (signal) query = query.abortSignal(signal);
                return query;
              },
              signal,
              (row) => row.id,
            )),
          );
        }
        return result;
      }),
    );
    for (const batch of batches) rows.push(...batch);
  }
  return rows;
}

export type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>;

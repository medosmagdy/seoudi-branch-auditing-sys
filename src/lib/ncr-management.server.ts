import type { NcrAudit, NcrBranch, NcrFilters, NcrFinding } from "./ncr-management";
import {
  branchMailAddresses,
  reportAuditScope,
  sectionOverride,
  visibleApprovedAudit,
} from "./report-feature-access.server";
import { readAllPages } from "./query-pages";
import type { ServerActor, ServerDatabase } from "./server-access.server";

const warehouse = "المخازن المركزية";

async function ncrScope(db: ServerDatabase, actor: ServerActor) {
  const [feature, audits] = await Promise.all([
    sectionOverride(db, actor, "ncr_management"),
    sectionOverride(db, actor, "audits"),
  ]);
  if (feature !== true || audits === false) throw new Error("غير مصرح لك بتحليل الأوديتات");
  return reportAuditScope(db, actor);
}

async function programsForNcr(
  db: ServerDatabase,
): Promise<{ id: string; code: NcrAudit["program"] }[]> {
  const { data, error } = await db.from("audit_types").select("id, code").in("code", ["FS", "GHP"]);
  if (error) throw new Error("تعذر تحميل نوع الفحص");
  return (data ?? []).flatMap(({ id, code }) =>
    code === "FS" || code === "GHP" ? [{ id, code }] : [],
  );
}

export async function ncrBranches(db: ServerDatabase, actor: ServerActor): Promise<NcrBranch[]> {
  const scope = await ncrScope(db, actor);
  const branches = await readAllPages((from, to) =>
    db.from("branches").select("id, name_ar, active").order("name_ar").order("id").range(from, to),
  );
  const owned = new Set<string>();
  if (scope.role === "auditor" || (scope.role === "manager" && scope.managerBranchIds !== null)) {
    const types = await programsForNcr(db);
    if (types.length > 0) {
      const people = [scope.userId, ...scope.sharedUserIds];
      for (let i = 0; i < people.length; i += 40) {
        const ids = people.slice(i, i + 40);
        const rows = await readAllPages((from, to) =>
          db
            .from("audits")
            .select("id, branch_id, created_by, auditor_id, status")
            .eq("status", "submitted")
            .in(
              "audit_type_id",
              types.map((t) => t.id),
            )
            .or(`created_by.in.(${ids.join(",")}),auditor_id.in.(${ids.join(",")})`)
            .order("id")
            .range(from, to),
        );
        for (const row of rows) if (visibleApprovedAudit(scope, row)) owned.add(row.branch_id);
      }
    }
  }
  return branches
    .filter(
      (branch) =>
        branch.name_ar.trim() !== warehouse &&
        (scope.role === "admin" ||
          owned.has(branch.id) ||
          (scope.role === "manager" &&
            (scope.managerBranchIds === null || scope.managerBranchIds.includes(branch.id)))),
    )
    .map((branch) => ({ id: branch.id, name: branch.name_ar, active: branch.active }));
}

export async function ncrAnalysis(db: ServerDatabase, actor: ServerActor, filters: NcrFilters) {
  const scope = await ncrScope(db, actor);
  const [types, branchResponse] = await Promise.all([
    programsForNcr(db),
    db.from("branches").select("id, name_ar, active").eq("id", filters.branchId).maybeSingle(),
  ]);
  const branch = branchResponse.data;
  if (branchResponse.error || !branch || branch.name_ar.trim() === warehouse)
    throw new Error("الفرع غير متاح");
  const allowedWithoutAudit =
    scope.role === "admin" ||
    (scope.role === "manager" &&
      (scope.managerBranchIds === null || scope.managerBranchIds.includes(branch.id)));
  const typeById = new Map(types.map((t) => [t.id, t.code] as const));
  const typeIds = types
    .filter((t) => filters.program === "both" || filters.program === t.code)
    .map((t) => t.id);
  const selected = typeIds.length
    ? (
        await readAllPages((from, to) =>
          db
            .from("audits")
            .select(
              "id, status, audit_type_id, score, audit_date, branch_id, created_by, auditor_id",
            )
            .eq("status", "submitted")
            .eq("branch_id", branch.id)
            .in("audit_type_id", typeIds)
            .gte("audit_date", filters.start)
            .lte("audit_date", filters.end)
            .order("audit_date", { ascending: false })
            .order("id")
            .range(from, to),
        )
      ).filter((a) => visibleApprovedAudit(scope, a))
    : [];
  if (!selected.length && !allowedWithoutAudit) {
    // Such a user can see the branch name in the picker only through an existing
    // approved audit. Return the empty view only if that approved access still exists.
    if (!(await ncrBranches(db, actor)).some((entry) => entry.id === branch.id))
      throw new Error("لا تملك صلاحية تحليل هذا الفرع");
  }
  const audits: NcrAudit[] = selected.map((a) => ({
    id: a.id,
    date: a.audit_date,
    score: a.score,
    program: typeById.get(a.audit_type_id)!,
  }));
  if (audits.length > 400) throw new Error("عدد الفحوصات كبير؛ اختار فترة أقصر");
  const findings: NcrFinding[] = [];
  let unresolved = 0;
  const auditType = new Map(selected.map((a) => [a.id, a.audit_type_id]));
  for (let i = 0; i < audits.length; i += 20) {
    const ids = audits.slice(i, i + 20).map((audit) => audit.id);
    const [answers, statuses] = await Promise.all([
      readAllPages((from, to) =>
        db
          .from("audit_answers")
          .select(
            "id, audit_id, question_id, score, comment, questions!inner(id, audit_type_id, item_id, section_id, text_ar, max_score, sections(name_ar))",
          )
          .in("audit_id", ids)
          .eq("is_na", false)
          .order("id")
          .range(from, to),
      ),
      readAllPages((from, to) =>
        db
          .from("audit_section_status")
          .select("audit_id, section_id")
          .in("audit_id", ids)
          .eq("is_na", true)
          .order("audit_id")
          .order("section_id")
          .range(from, to),
      ),
    ]);
    const excluded = new Set(statuses.map((row) => `${row.audit_id}/${row.section_id}`));
    for (const row of answers) {
      const q = row.questions;
      if (
        q.audit_type_id !== auditType.get(row.audit_id) ||
        excluded.has(`${row.audit_id}/${q.section_id}`)
      )
        continue;
      const maximum = q.max_score > 0 ? q.max_score : 4;
      if (row.score === null || row.score < 0 || row.score > maximum) {
        unresolved++;
        continue;
      }
      if (row.score === maximum) continue;
      findings.push({
        auditId: row.audit_id,
        questionId: row.question_id,
        section: q.sections?.name_ar ?? "عام",
        itemId: q.item_id,
        question: q.text_ar,
        observation: row.comment ?? "",
        earned: row.score,
        maximum,
      });
    }
  }
  return {
    branch: { id: branch.id, name: branch.name_ar, active: branch.active },
    audits,
    findings,
    unresolved,
  };
}

export async function ncrRecipients(db: ServerDatabase, actor: ServerActor, branchId: string) {
  const branch = (await ncrBranches(db, actor)).find((entry) => entry.id === branchId);
  if (!branch) throw new Error("الفرع غير متاح لك");
  const recipients = await branchMailAddresses(db, branch.id);
  return { configured: recipients.configured, to_addresses: recipients.to_addresses };
}

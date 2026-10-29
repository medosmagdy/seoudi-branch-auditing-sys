import { DASHBOARD_PROGRAM_IDS } from "../metrics";
import type { DashboardData } from "../data";
import type { DashboardSnapshot } from "../snapshot";
export function detailFixture(seed = 0) {
  const branches = ["a", "b", "empty"].map((id) => ({ id, name_ar: `فرع ${id}`, code: id }));
  const auditTypes = (["FS", "GHP", "FSMS"] as const).map((id) => ({
    id: DASHBOARD_PROGRAM_IDS[id],
    code: id,
    name_ar: id,
    name_en: id,
  }));
  const sections = auditTypes.flatMap((t) =>
    [0, 1].map((n) => ({
      id: `${t.id}-${n}`,
      audit_type_id: t.id,
      name_ar: `قسم ${t.id}-${n}`,
      active: true,
      order_index: n,
    })),
  );
  const questions = sections.map((s) => ({
    id: `q-${s.id}`,
    section_id: s.id,
    audit_type_id: s.audit_type_id,
    active: true,
    text_ar: "بند",
    item_id: s.id,
    max_score: 4,
  }));
  const audits = Array.from({ length: 12 }, (_, n) => ({
    id: `audit-${n}`,
    audit_type_id: auditTypes[n % 3]!.id,
    branch_id: n % 2 ? "b" : "a",
    auditor_id: n % 3 ? "user" : "other",
    audit_date: n % 4 ? "2026-10-05" : "2026-09-15",
    status: (n + seed) % 4 ? "submitted" : "draft",
    branchName: n % 2 ? "فرع b" : "فرع a",
    branchCode: n % 2 ? "b" : "a",
    typeName: auditTypes[n % 3]!.code,
    typeCode: auditTypes[n % 3]!.code,
    auditorName: "المراجع",
  }));
  const answers = audits.flatMap((a, n) =>
    questions
      .filter((q) => q.audit_type_id === a.audit_type_id)
      .map((q, j) => ({
        id: `ans-${n}-${j}`,
        audit_id: a.id,
        question_id: q.id,
        score: (n + seed) % 7 === 0 ? null : (n + j + seed) % 5,
        is_na: (n + j + seed) % 9 === 0,
        comment: (n + seed) % 2 ? "ملاحظة" : null,
      })),
  );
  const data = {
    branches,
    auditTypes,
    audits,
    questions,
    sections,
    answers,
    profiles: [],
  } as unknown as DashboardData;
  const snapshot: DashboardSnapshot = {
    version: 1,
    locations: branches.map((b) => ({ ...b, active: true })),
    audits: audits.map((a, n) => ({
      id: a.id,
      date: a.audit_date,
      status: a.status,
      branchId: a.branch_id,
      branchName: a.branchName,
      type: auditTypes[n % 3]!,
      generalDeduction: seed % 3,
      generalDeductions: [seed % 3],
      sections: sections
        .filter((s) => s.audit_type_id === a.audit_type_id)
        .map((s, j) => ({
          id: s.id,
          nameAr: s.name_ar,
          nameEn: null,
          isDelivery: false,
          isNa: (n + j + seed) % 11 === 0,
          maximum: 4,
          earned: (n + j + seed) % 5,
          deduction: seed % 2,
          deductions: [seed % 2],
          nonCompliant: 1,
          critical: n % 3 === 0 ? 1 : 0,
        })),
    })),
  };
  return { data, snapshot };
}

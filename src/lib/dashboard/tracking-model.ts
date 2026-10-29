import type { DashboardData } from "./data";
import { dashboardProgram } from "./snapshot";
import type { TrackingRecord, TrackingStatus } from "@/integrations/supabase/app-schema";
import type { DashboardProgram } from "./metrics";

export type TrackingField = "fs_status" | "ghp_status" | "fsms_status";
export type AuditCounts = { submitted: number; drafts: number };
export type MonthlyTrackingRow = TrackingRecord & {
  persisted?: boolean;
  audit_counts?: Partial<Record<DashboardProgram, AuditCounts>>;
};
export const TRACKING_PROGRAMS = ["FS", "GHP", "FSMS"] as const;
export const TRACKING_STATUSES: TrackingStatus[] = ["not_started", "in_progress", "completed"];
export const trackingField = (program: DashboardProgram): TrackingField =>
  `${program.toLowerCase()}_status` as TrackingField;

// Exact canonical keys, never substring matching: Maadi 1 cannot match Maadi 2
// and Sodic cannot borrow audits from Sodic East or Sodic Caesar.
export function trackingBranchKey(name: string) {
  const normalized = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim()
    .replace(/^فرع\s+/, "")
    .replace(/[\s\-–—_()]+/g, "");
  return normalized.replace(/^(?:ال)?معادي([12])$/, "معادي$1");
}
export function findTrackingRow<T extends { branch_name: string }>(name: string, rows: T[]) {
  const exact = rows.filter((row) => row.branch_name.trim() === name.trim());
  if (exact.length === 1) return exact[0];
  const key = trackingBranchKey(name);
  const candidates = rows.filter((row) => trackingBranchKey(row.branch_name) === key);
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function buildTrackingRows(
  branches: DashboardData["branches"],
  saved: TrackingRecord[],
  month: string,
): MonthlyTrackingRow[] {
  saved = saved.filter((row) => row.tracking_month === month);
  return branches.map((branch) => {
    const candidates = saved.filter((row) => row.branch_id === branch.id);
    // IDs are authoritative. A legacy name-only row can match only if unambiguous.
    const byId = [...candidates].sort(
      (a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || a.id.localeCompare(b.id),
    )[0];
    const key = trackingBranchKey(branch.name_ar);
    const uniqueBranchName =
      branches.filter((b) => trackingBranchKey(b.name_ar) === key).length === 1;
    const legacy = uniqueBranchName
      ? findTrackingRow(
          branch.name_ar,
          saved.filter((row) => !row.branch_id),
        )
      : undefined;
    const record = byId ?? legacy;
    return record
      ? { ...record, branch_id: branch.id, branch_name: branch.name_ar, persisted: true }
      : {
          id: `pending-${branch.id}`,
          branch_id: branch.id,
          branch_name: branch.name_ar,
          tracking_month: month,
          fs_status: "not_started",
          ghp_status: "not_started",
          fsms_status: "not_started",
          updated_at: "",
          persisted: false,
        };
  });
}

export function mergeTrackingAudits<T extends MonthlyTrackingRow>(
  rows: T[],
  audits: DashboardData["audits"],
  month: string,
): T[] {
  const counts = new Map<string, Partial<Record<DashboardProgram, AuditCounts>>>();
  for (const audit of audits) {
    if (
      !audit.audit_date?.startsWith(month.slice(0, 7)) ||
      !["draft", "submitted"].includes(audit.status)
    )
      continue;
    const program = dashboardProgram({
      id: audit.audit_type_id ?? "",
      code: audit.typeCode ?? null,
      name_ar: audit.typeName ?? null,
      name_en: null,
    });
    if (!program) continue;
    const branch = counts.get(audit.branch_id) ?? {};
    const count = branch[program] ?? { submitted: 0, drafts: 0 };
    if (audit.status === "submitted") count.submitted++;
    else count.drafts++;
    branch[program] = count;
    counts.set(audit.branch_id, branch);
  }
  return rows.map((row) => {
    const audit_counts = counts.get(row.branch_id) ?? {};
    const next = { ...row, audit_counts };
    for (const program of TRACKING_PROGRAMS) {
      const count = audit_counts[program];
      if (count) next[trackingField(program)] = count.submitted > 0 ? "completed" : "in_progress";
    }
    return next;
  });
}

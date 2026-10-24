import { programFromAuditType } from "./metrics";

export type TrackingStatus = "not_started" | "in_progress" | "completed";
export type TrackingRow = {
  id: string;
  branch_id?: string | null;
  branch_name: string;
  fs_status: TrackingStatus;
  ghp_status: TrackingStatus;
  fsms_status: TrackingStatus;
};

type TrackingAudit = {
  branch_id: string | null;
  branchName: string;
  audit_date: string | null;
  audit_type_id: string;
  typeName: string;
  typeCode: string;
  status: string;
};

const fields = ["fs_status", "ghp_status", "fsms_status"] as const;
const rank = { not_started: 0, in_progress: 1, completed: 2 };

export function trackingBranchKey(name: string): string {
  return name.normalize("NFKC")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/^\s*فرع\s+/, "")
    .replace(/[\s\-–_()]/g, "")
    .replace(/^(?:ال)?معادي([12])$/, "المعادي$1")
    .toLowerCase();
}

export function applyMonthlyAudits(
  rows: readonly TrackingRow[],
  audits: readonly TrackingAudit[],
  month: string,
): TrackingRow[] {
  const monthAudits = audits.filter((audit) => audit.audit_date?.slice(0, 7) === month.slice(0, 7));
  return rows.map((row) => {
    const next = { ...row };
    const statuses: Partial<Record<(typeof fields)[number], TrackingStatus>> = {};
    for (const audit of monthAudits) {
      const matches = row.branch_id
        ? row.branch_id === audit.branch_id
        : trackingBranchKey(row.branch_name) === trackingBranchKey(audit.branchName);
      if (!matches || (audit.status !== "submitted" && audit.status !== "draft")) continue;
      const program = programFromAuditType({ id: audit.audit_type_id, code: audit.typeCode, name_ar: audit.typeName });
      const field = `${program.toLowerCase()}_status` as (typeof fields)[number];
      const status = audit.status === "submitted" ? "completed" : "in_progress";
      if (!statuses[field] || rank[status] > rank[statuses[field]]) statuses[field] = status;
    }
    for (const field of fields) {
      if (statuses[field]) next[field] = statuses[field];
    }
    return next;
  });
}

export function findTrackingRow(rows: readonly TrackingRow[], name: string): TrackingRow | undefined {
  const matches = rows.filter((row) => trackingBranchKey(row.branch_name) === trackingBranchKey(name));
  const preferred = matches.find((row) => row.branch_id) ?? matches[0];
  if (!preferred) return undefined;
  const result = { ...preferred };
  for (const row of matches) {
    for (const field of fields) {
      if (rank[row[field]] > rank[result[field]]) result[field] = row[field];
    }
  }
  return result;
}

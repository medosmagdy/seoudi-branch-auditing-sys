import { reportBranchName } from "./report-branch-name";
import { z } from "zod";
export const severities = { high: "عالية", medium: "متوسطة", low: "منخفضة" } as const;
export const findingStatuses = {
  open: "لم يتم",
  new: "جديد",
  in_progress: "قيد التنفيذ",
  resolved: "تم",
} as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "تاريخ غير صالح");
export const findingSchema = z.object({
  id: z.string().uuid(),
  section: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(5000),
  initial_history: z.string().max(100),
  severity: z.enum(["high", "medium", "low"]),
  status: z.enum(["open", "new", "in_progress", "resolved"]),
  corrective_action: z.string().max(5000),
  evidence: z.string().max(5000),
  comments: z.string().max(5000),
  assigned_to: z.string().max(200),
  due_date: date.nullable(),
  photos: z
    .array(z.string().regex(/^maintenance\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/))
    .max(8),
});
export const reportSchema = z.object({
  id: z.string().uuid(),
  branch_id: z.string().uuid(),
  inspection_date: date,
  reviewer: z.string().trim().min(1).max(200),
  status: z.enum(["draft", "submitted"]),
  version: z.number().int().positive(),
  created_at: z.string(),
  source_report_id: z.string().uuid().nullable(),
  branch_manager: z.string().max(200).optional(),
  maintenance_area_manager: z.string().max(200).optional(),
  findings: z.array(findingSchema).max(1000),
});
export type Finding = z.infer<typeof findingSchema>;
export type MaintenanceReport = z.infer<typeof reportSchema>;
export interface Branch {
  id: string;
  name_ar: string;
  name_en?: string | null;
}
export interface ReportSummary {
  id: string;
  branch_id: string;
  inspection_date: string;
  reviewer: string;
  status: "draft" | "submitted";
  version: number;
  created_at: string;
  total: number;
  resolved: number;
  high_open: number;
}
export type LogFinding = Finding & {
  report_id: string;
  branch_id: string;
  inspection_date: string;
  branch_name: string;
};
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
// A partial legacy date has no invented day; keep its original string until a user picks a date.
export function faultDateForCalendar(raw: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const utc = new Date(raw + "T00:00:00Z");
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== raw) return undefined;
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}
export function formatFaultCalendarDate(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}
export function blankFinding(): Finding {
  return {
    id: crypto.randomUUID(),
    section: "",
    description: "",
    initial_history: "",
    severity: "medium",
    status: "new",
    corrective_action: "",
    evidence: "",
    comments: "",
    assigned_to: "",
    due_date: null,
    photos: [],
  };
}
export function metrics(findings: Finding[], asOf = today()) {
  const resolved = findings.filter((f) => f.status === "resolved").length;
  return {
    total: findings.length,
    resolved,
    open: findings.length - resolved,
    high: findings.filter((f) => f.severity === "high" && f.status !== "resolved").length,
    overdue: findings.filter((f) => f.status !== "resolved" && f.due_date && f.due_date < asOf)
      .length,
    rate: findings.length ? (resolved / findings.length) * 100 : null,
  };
}
export function latestReports<
  T extends Pick<
    MaintenanceReport,
    "branch_id" | "status" | "inspection_date" | "created_at" | "id"
  >,
>(reports: T[]): T[] {
  const sorted = reports
    .filter((r) => r.status === "submitted")
    .sort(
      (a, b) =>
        b.inspection_date.localeCompare(a.inspection_date) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    );
  const byBranch = new Map<string, T>();
  for (const report of sorted)
    if (!byBranch.has(report.branch_id)) byBranch.set(report.branch_id, report);
  return [...byBranch.values()];
}
export function reportFileName(branch: string, inspectionDate: string) {
  const d = new Date(inspectionDate + "T00:00:00Z");
  return `${reportBranchName(branch)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .trim()} Maintenance Report Q${Math.floor(d.getUTCMonth() / 3) + 1}-${d.getUTCFullYear()}`;
}
export function duplicateFindings(findings: Finding[]): Finding[] {
  return findings.map((f) => ({ ...f, id: crypto.randomUUID(), photos: [...f.photos] }));
}
export function filterReportFindings(
  findings: Finding[],
  status: "all" | Finding["status"],
  section = "all",
) {
  return findings
    .map((finding, index) => ({ finding, index }))
    .filter(
      ({ finding }) =>
        (status === "all" || finding.status === status) &&
        (section === "all" || finding.section === section),
    );
}
export function filterLog(
  rows: LogFinding[],
  branch: string,
  severity: string,
  status: string,
  search = "",
) {
  return rows.filter(
    (f) =>
      (!branch || f.branch_id === branch) &&
      (!severity || f.severity === severity) &&
      (!status || f.status === status) &&
      (!search || `${f.description} ${f.section} ${f.branch_name}`.includes(search)),
  );
}

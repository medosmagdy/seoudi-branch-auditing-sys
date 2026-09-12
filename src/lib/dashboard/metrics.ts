export type DashboardProgram = "FS" | "GHP" | "FSMS";

export const DASHBOARD_PROGRAM_IDS = {
  FS: "dfcbaad0-679d-41e4-9e52-8037e3d1311f",
  GHP: "fbfdfde7-6945-4e09-ba63-8ad8d6430a57",
  FSMS: "2119873b-1f4c-4d6e-9df7-b6ce426ccc4f",
} as const;

export function programFromAuditTypeId(auditTypeId: string | null | undefined): DashboardProgram {
  if (auditTypeId === DASHBOARD_PROGRAM_IDS.GHP) return "GHP";
  if (auditTypeId === DASHBOARD_PROGRAM_IDS.FSMS) return "FSMS";
  return "FS";
}

export function compliancePercentage(earned: number, possible: number): number {
  return possible > 0 ? Math.round((earned / possible) * 100) : 100;
}

export function cleanSectionName(name: string | null | undefined): string {
  return (name || "عام").replace(/^قسم\s+/i, "").trim();
}

export function auditMonthKey(date: string | null | undefined): string {
  return date ? date.slice(0, 7) : "غير محدد";
}

export function numericScore(score: number | null | undefined): number {
  return score == null || Number.isNaN(Number(score)) ? 0 : Number(score);
}

export function maxQuestionScore(maxScore: number | null | undefined): number {
  const value = Number(maxScore);
  return Number.isFinite(value) && value > 0 ? value : 4;
}

export function formatAuditComment(comment: string | null | undefined): string {
  return comment?.trim() || "خصم درجات (عدم مطابقة)";
}

export function sortNewestFirst<T extends { monthKey: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

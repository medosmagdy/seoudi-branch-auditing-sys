import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { computeAudit, computeSection, type ScoringSection } from "@/lib/scoring";
import { DASHBOARD_PROGRAM_IDS, type DashboardProgram } from "./metrics";
import type { LocationScope } from "@/lib/location-scope";

const sectionSchema = z.object({
  id: z.string(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  isDelivery: z.boolean(),
  isNa: z.boolean(),
  maximum: z.number().finite(),
  earned: z.number().finite(),
  deduction: z.number().finite(),
  deductions: z.array(z.number().finite()).optional(),
  nonCompliant: z.number().nonnegative(),
  critical: z.number().nonnegative(),
});
const snapshotSchema = z.object({
  version: z.literal(1),
  locations: z.array(
    z.object({
      id: z.string(),
      name_ar: z.string(),
      code: z.string().nullable(),
      active: z.boolean().nullable(),
    }),
  ),
  audits: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      status: z.string().nullable(),
      branchId: z.string(),
      branchName: z.string(),
      type: z.object({
        id: z.string(),
        code: z.string().nullable(),
        name_ar: z.string().nullable(),
        name_en: z.string().nullable(),
      }),
      generalDeduction: z.number().finite(),
      generalDeductions: z.array(z.number().finite()).optional(),
      sections: z.array(sectionSchema),
    }),
  ),
});

export type DashboardSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotAudit = DashboardSnapshot["audits"][number];
export type DashboardFilters = {
  scope: LocationScope;
  start: string;
  end: string;
  branch: string;
  program?: DashboardProgram | "all";
  submittedOnly?: boolean;
  allowedBranchIds?: readonly string[] | null;
};
export type ScoreBreakdown = ScorePair & {
  afterSections: number;
  sectionDeduction: number;
  generalDeduction: number;
};
export type ScorePair = { before: number; after: number };
const programs = ["FS", "GHP", "FSMS"] as const;
const round = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function dashboardProgram(type: SnapshotAudit["type"]): DashboardProgram | null {
  const text = [type.code, type.name_ar, type.name_en].filter(Boolean).join(" ").toLowerCase();
  if (type.id === DASHBOARD_PROGRAM_IDS.FSMS || /\bfsms\b/.test(text) || text.includes("أنظمة"))
    return "FSMS";
  if (type.id === DASHBOARD_PROGRAM_IDS.GHP || /\bghp\b/.test(text) || text.includes("النظافة"))
    return "GHP";
  if (
    type.id === DASHBOARD_PROGRAM_IDS.FS ||
    /\bfs\b|food safety/.test(text) ||
    text.includes("سلامة الغذاء")
  )
    return "FS";
  return null; // Never silently count an unknown program as FS.
}

export function monthWeights(month: string): Record<DashboardProgram, number> {
  return Number(month.slice(5, 7)) % 3 === 0
    ? { FS: 0.5, GHP: 0.4, FSMS: 0.1 }
    : { FS: 0.5, GHP: 0.5, FSMS: 0 };
}

/** Same section rounding and deduction rules as the audit; zero is a scored value. */
export function snapshotSectionResult(section: SnapshotAudit["sections"][number]) {
  return computeSection(
    {
      id: section.id,
      nameAr: section.nameAr,
      nameEn: section.nameEn,
      isDelivery: section.isDelivery,
      isNa: section.isNa,
      questions: section.maximum > 0 ? [{ id: section.id, maxScore: section.maximum }] : [],
      deductions: (section.deductions ?? [section.deduction]).map((percentage) => ({
        reasonText: "",
        percentage,
      })),
    },
    { [section.id]: { score: section.earned, isNa: false } },
  );
}

/** SQL aggregates integer question points, not percentages. Keep all scoring rules here unchanged. */
export function snapshotAuditBreakdown(audit: SnapshotAudit): ScoreBreakdown | null {
  const sections: ScoringSection[] = audit.sections.map((section) => ({
    id: section.id,
    nameAr: section.nameAr,
    nameEn: section.nameEn,
    isDelivery: section.isDelivery,
    isNa: section.isNa,
    questions: section.maximum > 0 ? [{ id: section.id, maxScore: section.maximum }] : [],
    deductions: (section.deductions ?? [section.deduction]).map((percentage) => ({
      reasonText: "",
      percentage,
    })),
  }));
  const answers = Object.fromEntries(
    audit.sections.map((s) => [s.id, { score: s.earned, isNa: false }]),
  );
  const after = computeAudit(
    sections,
    answers,
    (audit.generalDeductions ?? [audit.generalDeduction]).map((percentage) => ({ percentage })),
    audit.branchName,
  );
  if (after.overallMax <= 0) return null;
  const before = computeAudit(
    sections.map((s) => ({ ...s, deductions: [] })),
    answers,
    [],
    audit.branchName,
  );
  return {
    before: before.finalPercentage,
    after: after.finalPercentage,
    afterSections: after.overallPercentage,
    sectionDeduction: round(before.finalPercentage - after.overallPercentage),
    generalDeduction: round(after.overallPercentage - after.finalPercentage),
  };
}

export function snapshotAuditScore(audit: SnapshotAudit): ScorePair | null {
  const score = snapshotAuditBreakdown(audit);
  return score ? { before: score.before, after: score.after } : null;
}

export function dashboardMonthRange(month: string) {
  if (!month) return { start: "", end: "" };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { start: "", end: "" };
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10),
  };
}

export async function fetchDashboardSnapshot(filters: DashboardFilters, signal?: AbortSignal) {
  // This new function has not been added to the generated Supabase types yet.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => ReturnType<typeof supabase.rpc>;
  let request = rpc("sqop_dashboard_snapshot", {
    p_scope: filters.scope,
    p_start: filters.start || null,
    p_end: filters.end || null,
    p_branch: filters.branch === "all" ? null : filters.branch,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const parsed = snapshotSchema.parse(data);
  const allowed = filters.allowedBranchIds == null ? null : new Set(filters.allowedBranchIds);
  const snapshot = allowed
    ? {
        ...parsed,
        locations: parsed.locations.filter((branch) => allowed.has(branch.id)),
        audits: parsed.audits.filter((audit) => allowed.has(audit.branchId)),
      }
    : parsed;
  return filters.submittedOnly
    ? { ...snapshot, audits: snapshot.audits.filter((audit) => audit.status === "submitted") }
    : snapshot;
}

function selectedMonths(snapshot: DashboardSnapshot, filters: DashboardFilters) {
  const dates = snapshot.audits.map((a) => a.date).sort();
  const fallback = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const start = (filters.start || dates[0] || filters.end || fallback).slice(0, 7);
  const end = (filters.end || dates.at(-1) || filters.start || fallback).slice(0, 7);
  const months: string[] = [];
  for (let month = start; month <= end;) {
    months.push(month);
    const year = Number(month.slice(0, 4));
    const next = Number(month.slice(5, 7)) + 1;
    month = `${year + (next === 13 ? 1 : 0)}-${String(next === 13 ? 1 : next).padStart(2, "0")}`;
  }
  return months;
}

const scoreFields = ["before", "afterSections", "after"] as const;
function averageScores(scores: ScoreBreakdown[]): ScoreBreakdown | null {
  if (!scores.length) return null;
  const before = mean(scores.map((s) => s.before))!;
  const afterSections = mean(scores.map((s) => s.afterSections))!;
  const after = mean(scores.map((s) => s.after))!;
  return {
    before,
    afterSections,
    after,
    sectionDeduction: before - afterSections,
    generalDeduction: afterSections - after,
  };
}
function displayScore(score: ScoreBreakdown | null) {
  if (!score) return null;
  return {
    before: round(score.before),
    afterSections: round(score.afterSections),
    after: round(score.after),
    sectionDeduction: round(score.before - score.afterSections),
    generalDeduction: round(score.afterSections - score.after),
  };
}

export function aggregateDashboard(snapshot: DashboardSnapshot, filters: DashboardFilters) {
  const selectedProgram = filters.program ?? "all";
  const audits = snapshot.audits.filter(
    (a) =>
      (filters.allowedBranchIds == null || filters.allowedBranchIds.includes(a.branchId)) &&
      (filters.branch === "all" || a.branchId === filters.branch) &&
      (!filters.start || a.date >= filters.start) &&
      (!filters.end || a.date <= filters.end) &&
      (selectedProgram === "all" || dashboardProgram(a.type) === selectedProgram),
  );
  const visitedBranches = new Set(audits.map((audit) => audit.branchId));
  const locations = snapshot.locations.filter(
    (b) =>
      (filters.allowedBranchIds == null || filters.allowedBranchIds.includes(b.id)) &&
      (filters.branch === "all" || b.id === filters.branch) &&
      (b.active !== false || visitedBranches.has(b.id)),
  );
  const months = selectedMonths({ ...snapshot, audits }, filters);
  const submitted = audits.filter((a) => a.status === "submitted");
  const scored = submitted.map((audit) => ({
    audit,
    program: dashboardProgram(audit.type),
    score: snapshotAuditBreakdown(audit),
  }));
  // Build once instead of rescanning every visit for every branch/month/program.
  // Array insertion order is preserved, including floating-point summation order.
  const scoresByBranch = new Map<string, typeof scored>();
  const scoresByMonthProgram = new Map<string, typeof scored>();
  for (const entry of scored) {
    const branch = entry.audit.branchId;
    const branchEntries = scoresByBranch.get(branch) ?? [];
    branchEntries.push(entry);
    scoresByBranch.set(branch, branchEntries);
    if (entry.score !== null && entry.program !== null) {
      const key = JSON.stringify([branch, entry.audit.date.slice(0, 7), entry.program]);
      const entries = scoresByMonthProgram.get(key) ?? [];
      entries.push(entry);
      scoresByMonthProgram.set(key, entries);
    }
  }
  const rows = locations.flatMap((branch) =>
    months.map((month) => {
      const weights = monthWeights(month);
      const programScores = Object.fromEntries(
        programs.map((program) => {
          const entries =
            scoresByMonthProgram.get(JSON.stringify([branch.id, month, program])) ?? [];
          const average = averageScores(entries.map((a) => a.score!));
          return [program, average ? { ...average, visits: entries.length } : null];
        }),
      ) as Record<DashboardProgram, (ScoreBreakdown & { visits: number }) | null>;
      const required =
        selectedProgram === "all"
          ? programs.filter((p) => weights[p] > 0)
          : selectedProgram === "FSMS" && weights.FSMS === 0 && !programScores.FSMS
            ? []
            : [selectedProgram];
      const missing = required.filter((p) => programScores[p] === null);
      const available = required.filter((p) => programScores[p] !== null);
      const complete = missing.length === 0;
      let score: ScoreBreakdown | null = null;
      if (selectedProgram !== "all") score = programScores[selectedProgram];
      else if (complete) {
        const weighted = Object.fromEntries(
          scoreFields.map((field) => [
            field,
            programs.reduce(
              (sum, p) => sum + (weights[p] > 0 ? programScores[p]![field] * weights[p] : 0),
              0,
            ),
          ]),
        ) as Pick<ScoreBreakdown, (typeof scoreFields)[number]>;
        score = {
          ...weighted,
          sectionDeduction: weighted.before - weighted.afterSections,
          generalDeduction: weighted.afterSections - weighted.after,
        };
      } else score = averageScores(available.map((p) => programScores[p]!));
      return {
        branchId: branch.id,
        branchName: branch.name_ar,
        month,
        weights,
        programs: programScores,
        missing,
        applicable: required.length > 0,
        complete,
        provisional: !complete && score !== null,
        ...{
          before: score?.before ?? null,
          afterSections: score?.afterSections ?? null,
          after: score?.after ?? null,
          sectionDeduction: score?.sectionDeduction ?? null,
          generalDeduction: score?.generalDeduction ?? null,
        },
      };
    }),
  );
  const branchScores = locations.flatMap((branch) => {
    const values = rows
      .filter((r) => r.branchId === branch.id && r.after !== null)
      .map((r) => ({
        before: r.before!,
        afterSections: r.afterSections!,
        after: r.after!,
        sectionDeduction: r.sectionDeduction!,
        generalDeduction: r.generalDeduction!,
      }));
    const score = averageScores(values);
    return score ? [score] : [];
  });
  const total = displayScore(averageScores(branchScores));
  const completeCount = rows.filter((r) => r.applicable && r.complete).length;
  const expectedCount = rows.filter((r) => r.applicable).length;
  const ranking = locations
    .map((branch) => {
      const entries = (scoresByBranch.get(branch.id) ?? []).filter(
        (a) => a.program !== null && a.score !== null,
      );
      return {
        branchId: branch.id,
        branchName: branch.name_ar,
        visits: entries.length,
        programs: [...new Set(entries.map((a) => a.program!))],
        score: displayScore(averageScores(entries.map((a) => a.score!))),
      };
    })
    .sort(
      (a, b) =>
        (b.score?.after ?? -1) - (a.score?.after ?? -1) ||
        a.branchName.localeCompare(b.branchName, "ar"),
    );
  let rank = 0;
  let previous: number | null = null;
  const ranked = ranking.map((row, index) => {
    if (!row.score) return { ...row, rank: null };
    if (previous !== row.score.after) rank = index + 1;
    previous = row.score.after;
    return { ...row, rank };
  });
  return {
    rows,
    ranking: ranked,
    complete: expectedCount > 0 && completeCount === expectedCount,
    provisional: rows.some((r) => r.applicable && !r.complete),
    completeCount,
    expectedCount,
    completeAverage: total,
    before: total?.before ?? null,
    afterSections: total?.afterSections ?? null,
    after: total?.after ?? null,
    sectionDeduction: total?.sectionDeduction ?? null,
    generalDeduction: total?.generalDeduction ?? null,
    totalAudits: audits.length,
    submittedCount: submitted.length,
    draftsCount: audits.filter((a) => a.status === "draft").length,
    nonCompliant: submitted.reduce(
      (n, a) => n + a.sections.reduce((v, s) => v + s.nonCompliant, 0),
      0,
    ),
    critical: submitted.reduce((n, a) => n + a.sections.reduce((v, s) => v + s.critical, 0), 0),
    unknownPrograms: [
      ...new Set(
        scored
          .filter((a) => a.program === null)
          .map((a) => a.audit.type.code || a.audit.type.name_ar || a.audit.type.id),
      ),
    ],
  };
}

/** Show useful diagnostics without serializing requests, headers, or tokens. */
export function dashboardErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
  }
  if (error instanceof Error) return error.message.slice(0, 1200);
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const code = "code" in error && typeof error.code === "string" ? `[${error.code}] ` : "";
    return `${code}${error.message}`.slice(0, 1200);
  }
  return "تعذر تحديد تفاصيل الخطأ";
}

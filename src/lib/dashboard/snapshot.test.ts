import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  aggregateDashboard,
  dashboardProgram,
  monthWeights,
  snapshotAuditScore,
  snapshotAuditBreakdown,
  snapshotSectionResult,
  dashboardMonthRange,
  type DashboardSnapshot,
  type SnapshotAudit,
} from "./snapshot";
import { computeAudit, type ScoringSection } from "@/lib/scoring";

const filters = {
  scope: "branches" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  branch: "all",
};
function audit(
  program: string,
  score: number,
  options: Partial<SnapshotAudit> = {},
): SnapshotAudit {
  return {
    id: `${program}-${score}-${options.branchId ?? "a"}`,
    date: "2026-10-05",
    status: "submitted",
    branchId: "a",
    branchName: "فرع أ",
    type: { id: program, code: program, name_ar: program, name_en: program },
    generalDeduction: 0,
    sections: [
      {
        id: "s",
        nameAr: "قسم",
        nameEn: null,
        isDelivery: false,
        isNa: false,
        maximum: 100,
        earned: score,
        deduction: 0,
        nonCompliant: score < 100 ? 1 : 0,
        critical: score === 0 ? 1 : 0,
      },
    ],
    ...options,
  };
}
function snapshot(audits: SnapshotAudit[], multiple = false): DashboardSnapshot {
  return {
    version: 1,
    locations: [
      { id: "a", name_ar: "فرع أ", code: "A", active: true },
      ...(multiple ? [{ id: "b", name_ar: "فرع ب", code: "B", active: true }] : []),
    ],
    audits,
  };
}

describe("dashboard-only weighted aggregation", () => {
  it.each([1, 2, 4, 5, 7, 8, 10, 11])("uses 50/50 in month %s", (month) => {
    expect(monthWeights(`2026-${String(month).padStart(2, "0")}`)).toEqual({
      FS: 0.5,
      GHP: 0.5,
      FSMS: 0,
    });
  });
  it.each([3, 6, 9, 12])("uses 50/40/10 in month %s", (month) => {
    expect(monthWeights(`2026-${String(month).padStart(2, "0")}`)).toEqual({
      FS: 0.5,
      GHP: 0.4,
      FSMS: 0.1,
    });
  });
  it("averages repeats within a program before applying weights", () => {
    const result = aggregateDashboard(
      snapshot([audit("FS", 80), audit("FS", 100), audit("GHP", 80)]),
      filters,
    );
    expect(result.after).toBe(85);
    expect(result.rows[0]?.programs.FS?.visits).toBe(2);
  });
  it("uses before ALL deductions and after ALL deductions without altering the engine", () => {
    const fs = audit("FS", 90, { generalDeduction: 3 });
    fs.sections[0]!.deduction = 5;
    expect(snapshotAuditScore(fs)).toEqual({ before: 90, after: 82 });
    const result = aggregateDashboard(snapshot([fs, audit("GHP", 100)]), filters);
    expect(result.before).toBe(95);
    expect(result.after).toBe(91);
  });
  it("uses the available program as a provisional indicator when GHP is missing", () => {
    const result = aggregateDashboard(snapshot([audit("FS", 90)]), filters);
    expect(result.after).toBe(90);
    expect(result.provisional).toBe(true);
    expect(result.rows[0]?.missing).toEqual(["GHP"]);
    expect(result.rows[0]?.programs.FS?.after).toBe(90);
  });
  it("requires quarterly FSMS but ignores its weight outside quarter-end months", () => {
    const data = [audit("FS", 100), audit("GHP", 80)];
    expect(aggregateDashboard(snapshot([...data, audit("FSMS", 0)]), filters).after).toBe(90);
    const quarter = snapshot(data.map((a) => ({ ...a, date: "2026-09-05" })));
    const result = aggregateDashboard(quarter, {
      ...filters,
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(result.after).toBe(90);
    expect(result.provisional).toBe(true);
    expect(result.rows[0]?.missing).toEqual(["FSMS"]);
    quarter.audits.push(audit("FSMS", 60, { date: "2026-09-06" }));
    expect(
      aggregateDashboard(quarter, { ...filters, start: "2026-09-01", end: "2026-09-30" }).after,
    ).toBe(88);
  });
  it("gives each month and branch equal weight even when visit counts differ", () => {
    const data: SnapshotAudit[] = [];
    for (const branchId of ["a", "b"]) {
      for (const month of ["09", "10"]) {
        for (const program of ["FS", "GHP", "FSMS"]) {
          if (month === "10" && program === "FSMS") continue;
          const score =
            branchId === "b"
              ? 0
              : month === "10" || program === "FS"
                ? 100
                : program === "GHP"
                  ? 50
                  : 0;
          data.push(audit(program, score, { branchId, date: `2026-${month}-05` }));
        }
      }
    }
    expect(
      aggregateDashboard(snapshot(data, true), { ...filters, start: "2026-09-01" }).after,
    ).toBe(42.5);
  });
  it("marks empty/no-scored/draft-only periods incomplete and never returns 100%", () => {
    expect(aggregateDashboard(snapshot([]), filters).after).toBeNull();
    expect(
      aggregateDashboard(snapshot([audit("FS", 100, { status: "draft" })]), filters).draftsCount,
    ).toBe(1);
    expect(snapshotAuditScore(audit("FS", 100, { sections: [] }))).toBeNull();
  });
  it("does not silently classify unknown programs as FS", () => {
    expect(
      dashboardProgram({ id: "unknown", code: "OTHER", name_ar: null, name_en: null }),
    ).toBeNull();
    expect(dashboardProgram({ id: "wh", code: "FSMS (WH)", name_ar: null, name_en: null })).toBe(
      "FSMS",
    );
  });
  it("respects branch filters and does not hide incomplete active branches", () => {
    const data = snapshot([audit("FS", 100), audit("GHP", 100)], true);
    expect(aggregateDashboard(data, filters).after).toBe(100);
    expect(aggregateDashboard(data, filters).provisional).toBe(true);
    expect(aggregateDashboard(data, { ...filters, branch: "a" }).after).toBe(100);
  });
  it("matches the unchanged scoring engine across exclusions, rounding, delivery and excessive deductions", () => {
    for (let i = 0; i < 100; i++) {
      const branchName = i % 2 ? "دارك ستور زايد" : "فرع عادي";
      const sections: ScoringSection[] = Array.from({ length: 3 }, (_, j) => ({
        id: `s${j}`,
        nameAr: `قسم ${j}`,
        isDelivery: j === 2,
        isNa: i % 7 === j,
        questions: [
          { id: `q${j}a`, maxScore: 4 },
          { id: `q${j}b`, maxScore: 2 },
        ],
        deductions: [
          { reasonText: "", percentage: ((i + j) % 13) + 0.13 },
          { reasonText: "", percentage: i % 5 === 0 ? 110 : 0 },
        ],
      }));
      const answers = Object.fromEntries(
        sections.flatMap((s, j) =>
          s.questions.map((q, k) => [q.id, { score: (i + j + k) % (q.maxScore + 1), isNa: false }]),
        ),
      );
      const generalDeduction = (i % 11) + 0.37;
      const expected = computeAudit(
        sections,
        answers,
        [{ percentage: generalDeduction }],
        branchName,
      );
      const compact = audit("FS", 0, {
        branchName,
        generalDeduction,
        sections: sections.map((s) => ({
          id: s.id,
          nameAr: s.nameAr,
          nameEn: null,
          isNa: !!s.isNa,
          isDelivery: !!s.isDelivery,
          maximum: 6,
          earned: s.questions.reduce((sum, q) => sum + answers[q.id]!.score, 0),
          deduction: s.deductions.reduce((sum, d) => sum + d.percentage, 0),
          deductions: s.deductions.map((d) => d.percentage),
          nonCompliant: 0,
          critical: 0,
        })),
      });
      expect(snapshotAuditScore(compact)?.after ?? 0).toBe(expected.finalPercentage);
    }
  });
});

describe("phase 3 filters, deductions and ranking", () => {
  it("uses a simple available-program mean while quarterly data is incomplete, then applies 50/40/10", () => {
    const data = snapshot([
      audit("FS", 90, { date: "2026-09-10" }),
      audit("GHP", 80, { date: "2026-09-10" }),
    ]);
    const selected = { ...filters, start: "2026-09-01", end: "2026-09-30" };
    expect(aggregateDashboard(data, selected).after).toBe(85);
    data.audits.push(audit("FSMS", 70, { date: "2026-09-15" }));
    expect(aggregateDashboard(data, selected).after).toBe(84);
  });
  it("filters single programs without applying calendar weights, including FSMS outside quarter-end", () => {
    const data = snapshot([audit("FS", 90), audit("GHP", 80), audit("FSMS", 70)]);
    const selected = aggregateDashboard(data, { ...filters, program: "FSMS" });
    expect(selected.after).toBe(70);
    expect(selected.totalAudits).toBe(1);
    expect(selected.rows[0]?.missing).toEqual([]);
    expect(selected.ranking[0]?.visits).toBe(1);
  });
  it("keeps absent branches out of the numeric mean but lists them outside the ranking", () => {
    const selected = aggregateDashboard(snapshot([audit("FS", 75)], true), filters);
    expect(selected.after).toBe(75);
    expect(selected.ranking[1]).toMatchObject({
      branchId: "b",
      rank: null,
      visits: 0,
      score: null,
    });
  });
  it("ranks by raw visit means independently of the weighted composite", () => {
    const data = snapshot(
      [audit("FS", 100), audit("GHP", 50), audit("FSMS", 0), audit("FS", 60, { branchId: "b" })],
      true,
    );
    for (const row of data.audits) row.date = "2026-09-05";
    const result = aggregateDashboard(data, { ...filters, start: "2026-09-01", end: "2026-09-30" });
    expect(result.rows.find((r) => r.branchId === "a")?.after).toBe(70);
    expect(result.ranking[0]).toMatchObject({
      branchId: "b",
      rank: 1,
      visits: 1,
      score: { after: 60 },
    });
    expect(result.ranking[1]).toMatchObject({
      branchId: "a",
      rank: 2,
      visits: 3,
      score: { after: 50 },
    });
  });
  it("handles repeat visits, ties, and the same month/program filters in the ranking", () => {
    const data = snapshot(
      [
        audit("FS", 20),
        audit("FS", 100),
        audit("GHP", 0),
        audit("FS", 60, { branchId: "b" }),
        audit("FS", 0, { branchId: "b", date: "2026-09-01" }),
      ],
      true,
    );
    const selected = aggregateDashboard(data, { ...filters, program: "FS" });
    expect(selected.ranking.map((r) => r.rank)).toEqual([1, 1]);
    expect(selected.ranking.map((r) => r.score?.after)).toEqual([60, 60]);
    expect(selected.ranking.find((r) => r.branchId === "a")?.visits).toBe(2);
  });
  it("separates actual section and general deduction impacts, including clamping at zero", () => {
    const fs = audit("FS", 90, { generalDeduction: 5 });
    fs.sections[0]!.deduction = 2;
    expect(snapshotAuditBreakdown(fs)).toMatchObject({
      before: 90,
      afterSections: 88,
      after: 83,
      sectionDeduction: 2,
      generalDeduction: 5,
    });
    const total = aggregateDashboard(snapshot([fs]), filters);
    expect(total).toMatchObject({
      before: 90,
      afterSections: 88,
      after: 83,
      sectionDeduction: 2,
      generalDeduction: 5,
    });
    const limited = audit("FS", 5, { generalDeduction: 20 });
    expect(snapshotAuditBreakdown(limited)).toMatchObject({
      before: 5,
      after: 0,
      generalDeduction: 5,
    });
    limited.sections[0]!.deduction = 100;
    expect(snapshotAuditBreakdown(limited)).toMatchObject({
      before: 5,
      after: 0,
      sectionDeduction: 5,
      generalDeduction: 0,
    });
  });
  it("keeps deduction totals consistent under program and branch averaging", () => {
    const fs = audit("FS", 90, { generalDeduction: 5 });
    fs.sections[0]!.deduction = 2;
    const ghp = audit("GHP", 80, { generalDeduction: 1 });
    ghp.sections[0]!.deduction = 4;
    const result = aggregateDashboard(snapshot([fs, ghp]), filters);
    expect(result.before).toBe(85);
    expect(result.after).toBe(79);
    expect(result.sectionDeduction).toBe(3);
    expect(result.generalDeduction).toBe(3);
  });
  it("selects calendar month boundaries including leap years and clears to all months", () => {
    expect(dashboardMonthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(dashboardMonthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(dashboardMonthRange("")).toEqual({ start: "", end: "" });
  });
});

it("does not mark non-quarter months as missing when filtering FSMS without visits", () => {
  const result = aggregateDashboard(snapshot([]), { ...filters, program: "FSMS" });
  expect(result.after).toBeNull();
  expect(result.provisional).toBe(false);
  expect(result.expectedCount).toBe(0);
});

describe("section display uses the audit section engine", () => {
  it("applies section deductions without treating zero as missing", () => {
    const section = {
      id: "s",
      nameAr: "قسم",
      nameEn: null,
      isDelivery: false,
      isNa: false,
      maximum: 8,
      earned: 4,
      deduction: 10,
      nonCompliant: 1,
      critical: 1,
    };
    expect(snapshotSectionResult(section)).toMatchObject({
      max: 8,
      rawScore: 4,
      finalScore: 3.2,
      percentage: 40,
    });
    expect(snapshotSectionResult({ ...section, earned: 0 })).toMatchObject({
      max: 8,
      finalScore: 0,
      percentage: 0,
    });
    expect(snapshotSectionResult({ ...section, isNa: true })).toMatchObject({
      excluded: true,
      max: 0,
    });
  });
});

it("excludes restricted branch scores and names even when given a previously unfiltered snapshot", () => {
  const data = snapshot(
    [audit("FS", 80), audit("FS", 20, { id: "hidden", branchId: "b", branchName: "فرع ب" })],
    true,
  );
  const result = aggregateDashboard(data, { ...filters, allowedBranchIds: ["a"] });
  expect(result.totalAudits).toBe(1);
  expect(result.after).toBe(80);
  expect(result.ranking.map((branch) => branch.branchId)).toEqual(["a"]);
});

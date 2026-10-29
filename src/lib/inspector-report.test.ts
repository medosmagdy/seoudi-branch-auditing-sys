import { describe, expect, it } from "vitest";
import type { ReportModel } from "./report-data";
import { mapLimited, summarizeInspector } from "./inspector-report";
function model(
  branch: string,
  score: number,
  options: {
    unresolved?: boolean;
    excluded?: boolean;
    general?: number;
    deduction?: number;
    program?: string;
  } = {},
): ReportModel {
  return {
    auditId: branch,
    branchName: branch,
    auditTypeName: options.program ?? "FS",
    generalDeductions: [{ percentage: options.general ?? 0 }],
    sections: [
      {
        id: "s",
        nameAr: "قسم",
        excluded: options.excluded ?? false,
        isDelivery: false,
        deductions: [{ percentage: options.deduction ?? 0, reasonText: "" }],
        groups: [
          {
            questions: [
              {
                id: "q",
                score,
                maxScore: 4,
                isNa: false,
                unresolvedScore: options.unresolved ?? false,
              },
            ],
          },
        ],
      },
    ],
  } as ReportModel;
}
describe("inspector analytics", () => {
  it("counts explicit zero as a scored visit and ranks it lowest", () => {
    const result = summarizeInspector([model("zero", 0), model("full", 4)]);
    expect(result.after).toBe(50);
    expect(result.scoredVisits).toBe(2);
    expect(result.programs[0]?.lowest[0]?.branch).toBe("zero");
    expect(result.sections[0]).toMatchObject({ visits: 2, full: 1, fullRate: 50, itemLoss: 50 });
  });
  it("separates item losses, section deductions and general deductions", () => {
    const result = summarizeInspector([model("a", 2, { deduction: 10, general: 5 })]);
    expect(result).toMatchObject({
      before: 50,
      after: 35,
      sectionDeduction: 10,
      generalDeduction: 5,
    });
    expect(result.sections[0]).toMatchObject({ itemLoss: 50, deductionLoss: 10 });
  });
  it("uses actual clamped deduction effects at zero", () => {
    expect(summarizeInspector([model("a", 0, { deduction: 90, general: 90 })])).toMatchObject({
      after: 0,
      sectionDeduction: 0,
      generalDeduction: 0,
    });
  });
  it("keeps programs separate and reports all tied branches", () => {
    const r = summarizeInspector([model("a", 4), model("b", 4), model("c", 0, { program: "GHP" })]);
    expect(r.programs).toHaveLength(2);
    expect(r.programs.find((p) => p.program === "FS")?.highest).toHaveLength(2);
  });
  it("excludes unresolved historical scores, but respects excluded sections", () => {
    expect(summarizeInspector([model("a", 4, { unresolved: true })])).toMatchObject({
      unresolved: 1,
      scoredVisits: 0,
      after: null,
    });
    expect(summarizeInspector([model("a", 4, { unresolved: true, excluded: true })])).toMatchObject(
      { unresolved: 0, scoredVisits: 0 },
    );
  });
  it("averages repeat visits per branch before choosing highest and lowest", () => {
    const r = summarizeInspector([model("a", 0), model("a", 4), model("b", 3)]);
    expect(r.programs[0]?.lowest[0]).toMatchObject({ branch: "a", score: 50, visits: 2 });
  });
  it("loads with bounded concurrency while preserving result order", async () => {
    let pending = 0;
    let peak = 0;
    const values = await mapLimited(
      [1, 2, 3, 4, 5],
      async (n) => {
        pending++;
        peak = Math.max(peak, pending);
        await new Promise((r) => setTimeout(r, 1));
        pending--;
        return n * 2;
      },
      2,
    );
    expect(peak).toBe(2);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });
  it("fails the whole load when a report cannot be read", async () => {
    await expect(
      mapLimited([1, 2], async (n) => {
        if (n === 2) throw new Error("read failed");
        return n;
      }),
    ).rejects.toThrow("read failed");
  });
});

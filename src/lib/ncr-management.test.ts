import { describe, expect, it } from "vitest";
import {
  ncrFiltersSchema,
  ncrPeriodBounds,
  summarizeNcr,
  type NcrAudit,
  type NcrFinding,
} from "./ncr-management";
const jan = "2026-01-31";
const feb = "2026-02-11";
const a: NcrAudit = { id: "fs", date: jan, program: "FS", score: 0 };
const b: NcrAudit = { id: "ghp", date: feb, program: "GHP", score: 85 };
function finding(
  auditId: string,
  questionId: string,
  overrides: Partial<NcrFinding> = {},
): NcrFinding {
  return {
    auditId,
    questionId,
    itemId: questionId,
    section: "المخبوزات",
    question: "التحقق من بيانات الملصق",
    observation: "",
    earned: 2,
    maximum: 4,
    ...overrides,
  };
}
describe("NCR summaries", () => {
  it("groups explicitly equivalent notes across different FS/GHP questions, without confusing expiry with a missing date", () => {
    const data = summarizeNcr(
      [a, b],
      [
        finding("fs", "x", { earned: 0, observation: "عدم وجود تاريخ على منتجات التحضير" }),
        finding("ghp", "y", {
          question: "متابعة بيانات المنتج",
          observation: "تاريخ الإنتاج ممسوح على العبوة",
        }),
        finding("ghp", "z", { observation: "منتجات منتهية الصلاحية" }),
      ],
    );
    expect(data.repeated).toMatchObject([{ id: "concept/date-labels", visits: 2, zero: 1 }]);
    expect(data.priorities.some((p) => p.id === "concept/expired")).toBe(true);
    expect(data.byProgram.FS).toMatchObject({ average: 0, findings: 1, zero: 1 });
    expect(data.overall).toMatchObject({ visits: 2, average: 42.5, findings: 3 });
  });
  it("does not count multiple observations in one audit as repeat visits, or count duplicates, full marks and unknown scores", () => {
    const data = summarizeNcr(
      [a, { ...b, score: null }],
      [
        finding("fs", "x"),
        finding("fs", "x"),
        finding("fs", "y"),
        finding("fs", "full", { earned: 4 }),
        finding("invisible", "hidden"),
        finding("ghp", "unrelated", { section: "الجزارة", observation: "ملاحظة عامة" }),
      ],
    );
    expect(data.repeated).toHaveLength(0);
    expect(data.overall).toMatchObject({ visits: 2, scored: 1, average: 0, findings: 3 });
    expect(data.priorities.find((p) => p.findings.length === 2)?.visits).toBe(1);
  });
  it("can match the same checklist wording, but does not conflate unrelated sections", () => {
    const data = summarizeNcr(
      [a, b],
      [
        finding("fs", "x", { section: "المخبوزات", question: "التحقّق  من بيانات الملصق." }),
        finding("ghp", "y", { section: "المخبوزات" }),
        finding("ghp", "z", { section: "الجزارة" }),
      ],
    );
    expect(data.repeated).toMatchObject([{ kind: "checklist", visits: 2 }]);
    expect(data.repeated[0]?.findings).toHaveLength(2);
  });
  it("builds elapsed dates correctly around leap days and quarter/year boundaries and rejects invalid intervals", () => {
    expect(ncrPeriodBounds("month", "2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(ncrPeriodBounds("quarter", "2026-11")).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(ncrPeriodBounds("year", "2026-11")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    const filter = {
      branchId: "12345678-1234-4000-8000-123456789abc",
      program: "both",
      start: "2026-02-30",
      end: "2026-03-01",
    };
    expect(ncrFiltersSchema.safeParse(filter).success).toBe(false);
    expect(ncrFiltersSchema.safeParse({ ...filter, start: "2026-04-01" }).success).toBe(false);
  });
});

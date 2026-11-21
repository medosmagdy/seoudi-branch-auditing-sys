import { describe, expect, it } from "vitest";
import {
  deliveryLastHighlights,
  ncrActionForFinding,
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

it("recommends the observed correction, distinguishes missing records from missing measurement, and coaches documented behaviour only", () => {
  const correction = (question: string, observation: string) =>
    ncrActionForFinding(finding("fs", "behaviour", { question, observation }));
  const log = correction("استكمال سجل التسوية", "لم يتم استكمال سجل التسوية");
  expect(log).toContain("استكمل سجل التسوية من القراءات الموثقة فقط");
  expect(log).toContain("دون تقديرها");
  expect(log).toContain("نبّه الشيف إلى تسجيل القراءة");
  const practice = correction("التحقق من التسوية", "الشيف بيعمل التسوية بالعين");
  expect(practice).toContain("قِس حرارة قلب المنتج بترمومتر معاير");
  expect(practice).toContain("نبّه الشيف إلى القياس بدل التقدير");
  const equipment = correction("استخدام الترمومتر أثناء التسوية", "الترمومتر مش موجود عند الشيف");
  expect(equipment).toContain("وفّر ترمومترًا صالحًا");
  expect(equipment).not.toContain("نبّه الشيف");
  expect(correction("استخدام القفازات", "الموظف مش بيغير الجوانتي بين المهام")).toContain(
    "نبّه الموظف إلى تغيير القفاز",
  );
  const label = correction("عرض المنتج", "تاريخ الاكسباير مش مطبوع");
  expect(label).toContain("ثبّت بيانات التاريخ من مصدر موثّق");
  expect(label).not.toContain("اعزل المنتجات المنتهية");
  expect(correction("بند من غير ملاحظة", "")).toContain("سجّل سبب الخصم");
});

it("keeps the delivery count and score facts while pinning delivery last in capped views", () => {
  const note = "عدم وجود تاريخ على منتجات التحضير";
  const floor = [
    finding("fs", "floor-date", { observation: note }),
    ...Array.from({ length: 5 }, (_, index) =>
      finding("fs", `floor-${index}`, {
        section: `قسم ${index}`,
        question: `بند مستقل ${index}`,
        earned: 2,
      }),
    ),
  ];
  const delivery = Array.from({ length: 9 }, (_, index) =>
    finding(index < 5 ? "fs" : "ghp", `del-${index}`, {
      section: index === 0 ? "نقطة التجهيز الخارجي" : "قسم التوصيل",
      isDelivery: index === 0,
      observation: note,
      earned: 0,
    }),
  );
  const data = summarizeNcr([a, b], [...delivery, ...floor]);
  expect(data.overall).toMatchObject({ findings: 15, zero: 9, average: 42.5 });
  expect(data.priorities).toHaveLength(5);
  expect(data.priorities.at(-1)).toMatchObject({ isDelivery: true, visits: 2, zero: 9 });
  expect(data.sections.at(-1)).toMatchObject({ label: "الدليفري", count: 9, isDelivery: true });
  expect(deliveryLastHighlights(data.sections, 4).at(-1)).toMatchObject({ label: "الدليفري" });
  expect(data.findings.map((issue) => issue.questionId)).toEqual(
    [...floor, ...delivery].map((f) => f.questionId),
  );
  expect(data.repeated.at(-1)?.isDelivery).toBe(true);
  expect(data.priorities[0]?.isDelivery).toBe(false);
  expect(summarizeNcr([a, b], [floor[0]!, ...delivery]).priorities[0]?.findings).toHaveLength(1);
});

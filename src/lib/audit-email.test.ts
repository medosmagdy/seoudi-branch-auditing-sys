import { writeFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import {
  auditEmailTemplate,
  auditEmailHtml,
  auditEmailDraft,
  emailRecipients,
} from "./audit-email";
import { computeAudit, type ScoringSection } from "./scoring";
import type { ReportModel } from "./report-data";
function model(branch = "المعادي 1", delivery = true) {
  const sections: ScoringSection[] = [
    {
      id: "food",
      nameAr: "سلامة الغذاء",
      isDelivery: false,
      isNa: false,
      questions: [{ id: "q1", maxScore: 4 }],
      deductions: [],
    },
    ...(delivery
      ? [
          {
            id: "delivery",
            nameAr: "التوصيل",
            isDelivery: true,
            isNa: false,
            questions: [{ id: "q2", maxScore: 4 }],
            deductions: [],
          },
        ]
      : []),
  ];
  return {
    branchName: branch,
    branchNameEn: "Maadi 1",
    status: "submitted",
    auditTypeCode: "FS",
    auditTypeName: "سلامة الغذاء",
    auditTypeNameEn: "Food Safety",
    auditDate: "2026-10-26",
    result: computeAudit(
      sections,
      { q1: { score: 2, isNa: false }, q2: { score: 0, isNa: false } },
      [],
      branch,
    ),
  };
}
describe("audit email template", () => {
  it("uses the audit month and final scores, including a real zero delivery score", () => {
    const draft = auditEmailTemplate(model());
    expect(draft.body).toContain('إدارة فرع "المعادي 1"');
    expect(draft.body).toContain("عن شهر أكتوبر 2026");
    expect(draft.body).toContain("النهائية للفرع: 50%");
    expect(draft.body).toContain("النهائية لقسم التوصيل: 0%");
    expect(draft.subject).toBe("Maadi 1 FS Audit Report 26-10-2026");
  });
  it("omits both delivery paragraphs when absent, N/A or with no scoreable questions", () => {
    for (const m of [model("المعادي 1", false), model(), model()]) {
      if (m.result.delivery) {
        m.result.delivery.excluded = true;
      }
      expect(auditEmailTemplate(m).body).not.toContain("التوصيل");
    }
    const m = model();
    m.result.delivery!.max = 0;
    expect(auditEmailTemplate(m).hasDelivery).toBe(false);
  });
  it("uses GHP wording and preserves dark-store delivery inclusion in the overall score", () => {
    const m = model("دارك ستور المعادي");
    m.auditTypeCode = "GHP";
    const draft = auditEmailTemplate(m);
    expect(draft.body).toContain("تقرير مراجعة الممارسات الصحية");
    expect(draft.body).toContain(`النهائية للفرع: ${m.result.finalPercentage}%`);
    expect(m.result.finalPercentage).toBe(25);
    expect(draft.body).toContain("النهائية لقسم التوصيل: 0%");
  });
  it("rejects drafts, invalid dates, invalid percentages and entirely N/A results", () => {
    const m = model();
    expect(() => auditEmailTemplate({ ...m, status: "draft" })).toThrow("المعتمد");
    expect(() => auditEmailTemplate({ ...m, auditDate: "2026-02-30" })).toThrow("تاريخ");
    expect(() =>
      auditEmailTemplate({ ...m, result: { ...m.result, finalPercentage: NaN } }),
    ).toThrow("درجة");
    expect(() => auditEmailTemplate({ ...m, result: { ...m.result, overallMax: 0 } })).toThrow(
      "قابلة للتقييم",
    );
  });
  it("uses FSMS wording, respects explicit type codes and blocks unresolved non-NA questions", () => {
    const m = model();
    m.auditTypeCode = "FSMS";
    expect(auditEmailTemplate(m).body).toContain("الدورة المستندية ISO22000:2018");
    m.auditTypeCode = "FS";
    m.auditTypeName = "الممارسات الصحية";
    expect(auditEmailTemplate(m).body).toContain("تقرير مراجعة سلامة الغذاء");
    const sections = [
      { excluded: false, groups: [{ questions: [{ isNa: false, unresolvedScore: true }] }] },
    ] as ReportModel["sections"];
    expect(() => auditEmailTemplate({ ...m, sections })).toThrow("غير محسومة");
    sections[0]!.excluded = true;
    expect(() => auditEmailTemplate({ ...m, sections })).not.toThrow();
  });
  it("uses the exact quarterly FSMS body with calendar boundaries and never includes delivery lines", () => {
    for (const [date, quarter] of [
      ["2026-01-01", "الأول"],
      ["2026-03-31", "الأول"],
      ["2026-04-01", "الثاني"],
      ["2026-06-30", "الثاني"],
      ["2026-07-01", "الثالث"],
      ["2026-09-30", "الثالث"],
      ["2026-10-01", "الرابع"],
      ["2026-12-31", "الرابع"],
      ["2027-01-01", "الأول"],
    ]) {
      const m = model("روكسي");
      m.auditTypeCode = "FSMS";
      m.auditDate = date!;
      m.result.finalPercentage = 92.42;
      const draft = auditEmailTemplate(m);
      expect(draft.body).toContain("السادة الزملاء الأفاضل");
      expect(draft.body).toContain(
        `الدورة المستندية ISO22000:2018 لفرع روكسي عن الربع ${quarter} لعام ${date!.slice(0, 4)}.`,
      );
      expect(draft.body).toContain("نتيجة المراجعة النهائية : 92.42%");
      expect(draft.body).not.toContain("التوصيل");
      expect(draft.body).not.toContain("عن شهر");
      expect(draft.hasDelivery).toBe(false);
    }
    const maintenance = { ...model(), auditTypeCode: "MAINT", auditTypeName: "الصيانة" };
    expect(() => auditEmailTemplate(maintenance)).toThrow("الصيانة");
  });
  it("does not turn input into HTML or permit scripts; highlights exact percentages", () => {
    const html = auditEmailHtml("الدرجة 89.75%\n\n<img src=x onerror=alert(1)>");
    expect(html).toContain("background-color:#ffff00");
    expect(html).toContain("89.75%</span>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
describe("email drafts and recipient validation", () => {
  it("supports optional recipients, deduplicates addresses and rejects injected headers", () => {
    expect(emailRecipients("")).toEqual([]);
    expect(emailRecipients("A@example.com; a@example.com, b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(() => emailRecipients("a@example.com\r\nBcc: victim@example.com")).toThrow();
  });
  it("builds a MIME draft with UTF-8 HTML, plain text and the actual PDF attachment without sending", async () => {
    const draft = auditEmailTemplate(model());
    const blob = await auditEmailDraft({
      ...draft,
      to: "branch@example.com",
      cc: "branch@example.com;quality@example.com",
      pdf: new Blob(["%PDF-1.7 test"], { type: "application/pdf" }),
      pdfName: "المعادي FS Audit Report.pdf",
    });
    const text = await blob.text();
    if (process.env["SQOP_EMAIL_MIME_FIXTURE"])
      await writeFile(process.env["SQOP_EMAIL_MIME_FIXTURE"]!, text);
    expect(blob.type).toBe("message/rfc822");
    expect(text).toContain("X-Unsent: 1");
    expect(text).toContain("Content-Type: text/html; charset=UTF-8");
    expect(text).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(text).toContain("Content-Type: application/pdf");
    expect(text).toContain("Cc: quality@example.com");
    expect(text).not.toContain("From:");
    expect(text).toContain(btoa("%PDF-1.7 test"));
    expect(text).toContain("filename*=UTF-8''%D8");
    expect(text.split("\r\n").every((line) => line.length < 998)).toBe(true);
  });
  it("does not build invalid or oversized attachments or allow header injection", async () => {
    const input = {
      subject: "Report",
      body: "Text",
      to: "",
      cc: "",
      pdf: new Blob(["pdf"], { type: "application/pdf" }),
      pdfName: "report.pdf",
    };
    await expect(
      auditEmailDraft({ ...input, subject: "Report\r\nBcc: other@example.com" }),
    ).rejects.toThrow("عنوان");
    await expect(
      auditEmailDraft({ ...input, pdf: new Blob([], { type: "application/pdf" }) }),
    ).rejects.toThrow("PDF");
    await expect(
      auditEmailDraft({
        ...input,
        pdf: new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "application/pdf" }),
      }),
    ).rejects.toThrow("20");
  });
});

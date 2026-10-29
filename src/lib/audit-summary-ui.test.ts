import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", null, children),
}));
import { AuditSummaryScores } from "@/components/audit/AuditSummaryScores";
import { auditExportFixture } from "./__fixtures__/audit-export";

describe("audit summary overview", () => {
  it("keeps scores and section rows and clearly separates the final result", () => {
    const model = auditExportFixture();
    const html = renderToStaticMarkup(createElement(AuditSummaryScores, { model, canEdit: true }));
    for (const label of [
      "نتائج الأقسام",
      "النسبة قبل الخصم العام",
      "الخصومات العامة",
      "النتيجة النهائية",
      "مراجعة القسم",
    ])
      expect(html).toContain(label);
    expect(html).toContain(`${model.result.finalPercentage}%`);
    expect(html).toContain("summary-final-score");
    for (const section of model.result.sections) expect(html).toContain(section.nameAr);
    expect(html).toContain("التوصيل: تقييم منفصل عن النتيجة النهائية");
  });
  it("labels dark-store delivery as included without altering the computed score", () => {
    const model = auditExportFixture("دارك ستور المعادي");
    const html = renderToStaticMarkup(createElement(AuditSummaryScores, { model, canEdit: false }));
    expect(html).toContain("التوصيل مشمول في النتيجة النهائية");
    expect(html).not.toContain("تقييم منفصل");
    expect(html).toContain("عرض القسم");
    expect(html).toContain(`${model.result.finalPercentage}%`);
  });
});

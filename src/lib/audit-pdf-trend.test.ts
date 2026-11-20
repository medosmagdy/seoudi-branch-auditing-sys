import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReportDocument } from "@/components/report/ReportDocument";
import { PdfMonthlyTrend } from "@/components/report/PdfMonthlyTrend";
import { auditExportFixture } from "./__fixtures__/audit-export";

const scores = (...values: number[]) =>
  values.map((score, i) => ({ score, month: `2026-${String(i + 1).padStart(2, "0")}` }));
const chart = (history: ReturnType<typeof scores>) =>
  renderToStaticMarkup(createElement(PdfMonthlyTrend, { history, currentMonth: "2026-04" }));

it("changes only the exported chart while preserving report values and section text", () => {
  const model = auditExportFixture();
  model.history = scores(90, 93, 92, 95);
  const screen = renderToStaticMarkup(createElement(ReportDocument, { model }));
  const pdf = renderToStaticMarkup(createElement(ReportDocument, { model, forPdf: true }));
  expect(screen).not.toContain("المحور الرأسي");
  expect(pdf).toContain("المحور الرأسي");
  expect(pdf).not.toContain("النتيجة النهائية المعتمدة");
  expect(pdf).toMatch(
    new RegExp(`النتيجة النهائية بعد الخصم</span><div[^>]*>${model.result.finalPercentage}%`),
  );
  expect(pdf).toContain(">89%</text>");
  expect(pdf).toContain(">96%</text>");
  expect(pdf).toContain(">-1</text>");
  expect(pdf).toContain(">+3</text>");

  const removeChart = (html: string) => {
    const title = html.indexOf("اتجاه درجات الفرع حسب الشهر");
    const chartEnd = html.lastIndexOf(
      "<div data-report-block",
      html.indexOf("ملخص نسب امتثال الأقسام"),
    );
    const chartStart = html.lastIndexOf(
      html === pdf ? "<section data-report-block" : "<div data-report-block",
      title,
    );
    expect(chartStart).toBeGreaterThanOrEqual(0);
    expect(chartEnd).toBeGreaterThan(chartStart);
    return html.slice(0, chartStart) + html.slice(chartEnd);
  };
  expect(removeChart(pdf)).toBe(removeChart(screen));
});

it("expands the axis for a 70% dip and shows the signed changes in percentage points", () => {
  const markup = chart(scores(90, 93, 70, 95));
  for (const label of ["65%", "100%", "70%", "-23", "+25"])
    expect(markup).toContain(`>${label}</text>`);
});

it("handles boundary scores, empty and single-month series, and flags missing months", () => {
  expect(chart([])).toBe("");
  expect(chart(scores(0))).toContain("2026-01: 0%");
  expect(chart(scores(100))).toContain("2026-01: 100%");
  expect(chart(scores(100, 100))).toContain(">0</text>");
  expect(chart(scores(100, 0, 100))).not.toMatch(/NaN|Infinity/);
  const gap = chart([scores(90)[0]!, { month: "2026-03", score: 95 }]);
  expect(gap).toContain('stroke-dasharray="5 5"');
  expect(gap).toContain("شهور من غير بيانات");
});

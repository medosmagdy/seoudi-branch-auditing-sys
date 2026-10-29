import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { aggregateDashboard, type DashboardSnapshot } from "./snapshot";
import { DashboardRanking } from "@/components/DashboardRanking";
import { DashboardScoreDetails } from "@/components/DashboardScoreDetails";

const data: DashboardSnapshot = {
  version: 1,
  audits: [],
  locations: Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    name_ar: `فرع ${String(i).padStart(2, "0")}`,
    code: null,
    active: true,
  })),
};
const filters = {
  scope: "branches" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  branch: "all",
};
const summary = aggregateDashboard(data, filters);

describe("phase 3 dashboard rendering", () => {
  it("paginates the ranking and keeps branches without visits outside numeric ranks", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardRanking, {
        summary,
        filters: {
          locations: data.locations,
          branch: "all",
          fromMonth: "2026-10",
          toMonth: "2026-12",
          program: "all",
          onBranch: () => {},
          onFromMonth: () => {},
          onToMonth: () => {},
          onResetPeriod: () => {},
          onProgram: () => {},
        },
      }),
    );
    expect(html).toContain("لا توجد فحوصات");
    expect(html).toContain(">فرع 00<");
    expect(html).not.toContain(">فرع 10<");
    expect(html).not.toContain("NaN");
    expect(html.match(/type="month"/g)).toHaveLength(2);
    expect(html).toContain("من شهر");
    expect(html).toContain("إلى شهر");
    expect(html).not.toContain('type="text"');
  });
  it("renders shared filters, paginated details and separate deduction impacts", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardScoreDetails, {
        summary,
        filters: {
          locations: data.locations,
          branch: "all",
          fromMonth: "2026-10",
          toMonth: "2026-12",
          program: "all",
          onBranch: () => {},
          onFromMonth: () => {},
          onToMonth: () => {},
          onResetPeriod: () => {},
          onProgram: () => {},
        },
      }),
    );
    expect(html.match(/type="month"/g)).toHaveLength(2);
    expect(html).toContain("من شهر");
    expect(html).toContain("إلى شهر");
    expect(html).toContain("نوع الفحص");
    expect(html).toContain("خصومات الأقسام");
    expect(html).toContain("الخصومات العامة");
    expect(html).not.toContain("التقييم غير مكتمل");
    expect(html).not.toContain("فرع 06 ·");
  });
});

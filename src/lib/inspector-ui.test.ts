import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children),
}));
vi.mock("@/components/ui/dialog", () => {
  const container = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return {
    Dialog: container,
    DialogContent: container,
    DialogHeader: container,
    DialogTitle: container,
    DialogDescription: container,
  };
});
import { InspectorReport } from "@/components/admin/InspectorReport";
import type { ReportModel } from "./report-data";

describe("inspector report content", () => {
  it("shows saved draft/submitted counts, actual zero, unresolved exclusion and filters", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const rows = ["a", "b", "c"].map((id, i) => ({
      id,
      audit_date: "2026-10-11",
      status: i === 2 ? "draft" : "submitted",
      branch_id: id,
      audit_type_id: "fs",
      branchName: `branch-${id}`,
      programName: "FS",
    }));
    client.setQueryData(["inspector-audits", "u"], rows);
    const models = [false, true].map((unresolved, i) => ({
      auditId: rows[i]!.id,
      branchName: rows[i]!.branchName,
      auditTypeName: "FS",
      generalDeductions: [],
      sections: [
        {
          id: "s",
          nameAr: "قسم",
          isDelivery: false,
          excluded: false,
          deductions: [],
          groups: [
            {
              questions: [
                { id: "q", maxScore: 4, score: 0, isNa: false, unresolvedScore: unresolved },
              ],
            },
          ],
        },
      ],
    })) as unknown as ReportModel[];
    client.setQueryData(["inspector-analysis", "u", ["a", "b"]], models);
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(InspectorReport, { user: { id: "u", full_name: "مفتش" }, onClose: () => {} }),
      ),
    );
    expect(html).toContain("تقرير المفتش");
    expect(html).toContain("المسودات");
    expect(html).toContain("استُبعد");
    expect(html).toContain("0%");
    expect(html).toContain("أعلى وأقل الفروع");
    expect(html).toContain('type="date"');
    expect(html).toContain("كل الفروع");
    expect(html).toContain("كل الأوديتس");
    expect(html).not.toContain("NaN");
    expect(html.match(/role="tab"/g) ?? []).toHaveLength(4);
    expect(html).toContain("تفصيل أثر الخصومات");
    expect(html).not.toContain("<table");
    client.clear();
  });
});

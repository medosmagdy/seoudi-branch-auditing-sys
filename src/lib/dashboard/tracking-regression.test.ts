import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { MonthlyTrackingCard } from "@/components/dashboard/MonthlyTrackingCard";
import { mergeTrackingAudits } from "./tracking";
import type { TrackingRecord } from "@/integrations/supabase/app-schema";
import type { DashboardData } from "./data";
const row: TrackingRecord = {
  id: "saved",
  branch_id: "maadi",
  branch_name: "المعادي1",
  tracking_month: "2026-10-01",
  fs_status: "not_started",
  ghp_status: "not_started",
  fsms_status: "not_started",
  updated_at: "",
};
describe("reported monthly tracking regressions", () => {
  it("renders the real Maadi 1, Maadi 2 and Sodic East rows despite spacing/hamza differences", () => {
    const rows = [
      row,
      { ...row, id: "two", branch_id: "maadi2", branch_name: "معادي2" },
      { ...row, id: "east", branch_id: "east", branch_name: "سوديك إيست" },
    ].map((r) => ({ ...r, fs_status: "completed" as const }));
    const html = renderToStaticMarkup(
      createElement(MonthlyTrackingCard, { rows, canEdit: true, onUpdate: async () => {} }),
    );
    for (const name of ["المعادي1", "معادي2", "سوديك إيست"]) expect(html).toContain(`>${name}<`);
  });
  it("keeps a submitted FS audit completed even when an older draft appears later in the response", () => {
    const audits = ["submitted", "draft"].map((status, n) => ({
      id: String(n),
      branch_id: "maadi",
      audit_type_id: "fs",
      audit_date: "2026-10-05",
      typeCode: "FS",
      typeName: "سلامة الغذاء",
      status,
    })) as DashboardData["audits"];
    expect(mergeTrackingAudits([row], audits, "2026-10-01")[0]!.fs_status).toBe("completed");
  });
});

describe("monthly tracking loading and error UX", () => {
  it("never fabricates not-started branch states while loading or after a failed request", () => {
    const props = { rows: [row], canEdit: true, onUpdate: async () => {}, month: "2026-09-01" };
    const loading = renderToStaticMarkup(
      createElement(MonthlyTrackingCard, { ...props, loading: true }),
    );
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("معادي");
    const error = renderToStaticMarkup(
      createElement(MonthlyTrackingCard, { ...props, error: "فشل الاتصال", onRetry: () => {} }),
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("إعادة المحاولة");
    expect(error).not.toContain("المعادي1");
    expect(error).toContain("سبتمبر");
    expect(error).not.toContain("أكتوبر");
  });
});

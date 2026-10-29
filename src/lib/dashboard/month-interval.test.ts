import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { dashboardMonthInterval, trackingIntervalMonths } from "./month-interval";
import type { DashboardData } from "./data";
import { aggregateDashboard, type SnapshotAudit } from "./snapshot";

const audit = (date: string, score: number): SnapshotAudit => ({
  id: date,
  date,
  status: "submitted",
  branchId: "a",
  branchName: "فرع أ",
  type: { id: "FS", code: "FS", name_ar: "FS", name_en: "FS" },
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
      nonCompliant: 0,
      critical: 0,
    },
  ],
});

describe("inclusive month interval", () => {
  it("includes complete quarters and retains the actual monthly scores", () => {
    const range = dashboardMonthInterval("2026-01", "2026-03");
    expect(range).toEqual({ valid: true, start: "2026-01-01", end: "2026-03-31" });
    const summary = aggregateDashboard(
      {
        version: 1,
        locations: [{ id: "a", name_ar: "فرع أ", code: null, active: true }],
        audits: [
          audit("2025-12-31", 0),
          audit("2026-01-01", 60),
          audit("2026-02-15", 90),
          audit("2026-03-31", 90),
          audit("2026-04-01", 0),
        ],
      },
      { scope: "branches", branch: "all", program: "FS", start: range.start, end: range.end },
    );
    expect(summary.totalAudits).toBe(3);
    expect(summary.after).toBe(80);
    expect(summary.rows.map((row) => row.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("handles a single month, leap days and year boundaries", () => {
    expect(dashboardMonthInterval("2028-02", "2028-02").end).toBe("2028-02-29");
    expect(trackingIntervalMonths("2026-11", "2027-02", "2026-10")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
  it.each([
    ["2026-04", "2026-03"],
    ["2026-01", ""],
    ["", "2026-03"],
    ["2026-13", "2026-14"],
    ["garbage", "2026-01"],
  ])("rejects invalid or incomplete intervals %s / %s", (from, to) => {
    expect(dashboardMonthInterval(from, to).valid).toBe(false);
    expect(trackingIntervalMonths(from, to, "2026-10")).toEqual([]);
  });
  it("clears overview bounds and keeps current-month tracking explicit", () => {
    expect(dashboardMonthInterval("", "")).toEqual({ valid: true, start: "", end: "" });
    expect(trackingIntervalMonths("", "", "2026-10")).toEqual(["2026-10"]);
  });
});

it("keeps each month of a quarter isolated in monthly tracking", async () => {
  const { mergeTrackingAudits, buildTrackingRows } = await import("./tracking-model");
  const branches = [
    {
      id: "a",
      name_ar: "المعادي1",
      code: "A",
      active: true,
      created_at: "2026-01-01",
      name_en: null,
    },
  ];
  const audits = [
    {
      id: "one",
      branch_id: "a",
      audit_type_id: "fs",
      audit_date: "2026-10-01",
      typeCode: "FS",
      typeName: "FS",
      status: "submitted",
    },
  ];
  const october = mergeTrackingAudits(
    buildTrackingRows(branches, [], "2026-10-01"),
    audits as DashboardData["audits"],
    "2026-10-01",
  );
  const november = mergeTrackingAudits(
    buildTrackingRows(branches, [], "2026-11-01"),
    audits as DashboardData["audits"],
    "2026-11-01",
  );
  expect(october[0]?.fs_status).toBe("completed");
  expect(november[0]?.fs_status).toBe("not_started");
  expect(november[0]?.tracking_month).toBe("2026-11-01");
});

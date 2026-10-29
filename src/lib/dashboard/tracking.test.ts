import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { mergeTrackingAudits } from "./tracking";
import type { TrackingRecord } from "@/integrations/supabase/app-schema";
import type { DashboardData } from "./data";
const row: TrackingRecord = {
  id: "row",
  branch_id: "a",
  branch_name: "فرع أ",
  tracking_month: "2026-10-01",
  fs_status: "not_started",
  ghp_status: "completed",
  fsms_status: "not_started",
  updated_at: "old",
};
function audits(
  rows: { status: string; typeCode: string; audit_date?: string; branch_id?: string }[],
) {
  return rows.map((item, n) => ({
    id: String(n),
    typeName: item.typeCode,
    audit_date: "2026-10-05",
    branch_id: "a",
    ...item,
  })) as DashboardData["audits"];
}
describe("monthly tracking derives states from real audits", () => {
  it("prioritizes submitted audits over drafts independently of result order", () => {
    const input = audits([
      { status: "submitted", typeCode: "FS" },
      { status: "draft", typeCode: "FS" },
      { status: "submitted", typeCode: "FSMS" },
    ]);
    expect(mergeTrackingAudits([row], input, "2026-10-01")).toEqual([
      {
        ...row,
        fs_status: "completed",
        fsms_status: "completed",
        audit_counts: { FS: { submitted: 1, drafts: 1 }, FSMS: { submitted: 1, drafts: 0 } },
      },
    ]);
    expect(row.fs_status).toBe("not_started");
  });
  it("ignores other months, branches, programs and visit statuses", () => {
    const input = audits([
      { status: "submitted", typeCode: "FS", audit_date: "2026-09-30" },
      { status: "submitted", typeCode: "FS", branch_id: "other" },
      { status: "archived", typeCode: "GHP" },
      { status: "submitted", typeCode: "OTHER" },
    ]);
    expect(mergeTrackingAudits([row], input, "2026-10-01")).toEqual([{ ...row, audit_counts: {} }]);
    expect(mergeTrackingAudits([], input, "2026-10-01")).toEqual([]);
  });
});

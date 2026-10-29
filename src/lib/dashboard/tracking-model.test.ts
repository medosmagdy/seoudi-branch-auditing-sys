import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  buildTrackingRows,
  findTrackingRow,
  mergeTrackingAudits,
  trackingBranchKey,
} from "./tracking-model";
import { groupTrackingRows } from "./tracking-groups";
import type { DashboardData } from "./data";
import type { TrackingRecord } from "@/integrations/supabase/app-schema";
const month = "2026-10-01";
const saved: TrackingRecord = {
  id: "saved",
  branch_id: "a",
  branch_name: "المعادي1",
  tracking_month: month,
  fs_status: "not_started",
  ghp_status: "not_started",
  fsms_status: "not_started",
  updated_at: "2026-10-01",
};
const branches = [
  { id: "a", name_ar: "المعادي1" },
  { id: "b", name_ar: "معادي2" },
  { id: "east", name_ar: "سوديك إيست" },
  { id: "sodic", name_ar: "سوديك" },
  { id: "extra", name_ar: "فرع جديد" },
] as DashboardData["branches"];
function audits(statuses: string[], program: string, branch_id = "a", date = "2026-10-15") {
  return statuses.map((status, n) => ({
    id: `${program}-${n}`,
    branch_id,
    audit_type_id: "unknown",
    typeCode: program,
    typeName: program,
    audit_date: date,
    status,
  })) as DashboardData["audits"];
}
describe("monthly tracking branch identity and derivation", () => {
  it("keeps the verified District branch with Dr Maged by ID even if its display name changes", () => {
    const row = {
      id: "tracking-row",
      branch_id: "b8488fe0-4b60-4c57-abf1-070431346b95",
      branch_name: "District Five",
      fs_status: "completed",
    };
    const additional = {
      id: "another",
      branch_id: "unrelated",
      branch_name: "ديستركت 6",
      fs_status: "not_started",
    };
    const grouped = groupTrackingRows([row, additional]);
    expect(grouped.find((group) => group.name === "د. ماجد")?.rows).toEqual([row]);
    expect(grouped.find((group) => group.name === "فروع إضافية")?.rows).toEqual([additional]);
    expect(grouped.flatMap((group) => group.rows)).toHaveLength(2);
  });
  it("keeps District 5 with Dr Maged without hiding or duplicating other branches", () => {
    for (const name of ["ديستركت5", "ديستركت 5", "ديستركت ٥", "ديستركت"]) {
      const row = { id: "district", branch_name: name };
      const groups = groupTrackingRows([row]);
      expect(groups.find((group) => group.name === "د. ماجد")?.rows).toEqual([row]);
      expect(groups.flatMap((group) => group.rows)).toEqual([row]);
    }
    const other = { id: "other", branch_name: "ديستركت 6" };
    expect(groupTrackingRows([other])[0]?.name).toBe("فروع إضافية");
  });
  it("matches only full canonical names including Arabic numerals, hamza and documented Maadi variants", () => {
    for (const name of ["المعادي 1", "المعادي١", "معادي ۱", "فرع المعادي 1"])
      expect(trackingBranchKey(name)).toBe(trackingBranchKey("المعادي1"));
    expect(trackingBranchKey("سوديك ايست")).toBe(trackingBranchKey("سوديك إيست"));
    expect(
      findTrackingRow(
        "المعادي 2",
        branches.map((b) => ({ branch_name: b.name_ar })),
      )?.branch_name,
    ).toBe("معادي2");
    expect(
      findTrackingRow("سوديك", [{ branch_name: "سوديك إيست" }, { branch_name: "سوديك سيزر" }]),
    ).toBeUndefined();
    expect(trackingBranchKey("المعادي 1")).not.toBe(trackingBranchKey("دارك ستور المعادي"));
    expect(trackingBranchKey("المعادي 1")).not.toBe(trackingBranchKey("المعادي 2"));
  });
  it("uses branch IDs before names, does not reassign another branch's tracking, and supports missing manual rows", () => {
    const input = [saved, { ...saved, id: "bad", branch_id: "unrelated", branch_name: "معادي2" }];
    const before = structuredClone(input);
    const rows = buildTrackingRows(branches, input, month);
    expect(rows[0]).toMatchObject({ id: "saved", branch_id: "a", persisted: true });
    expect(rows[1]).toMatchObject({ id: "pending-b", branch_id: "b", persisted: false });
    expect(rows).toHaveLength(5);
    expect(
      buildTrackingRows(branches, input, "2026-09-01").every((row) => row.persisted === false),
    ).toBe(true);
    expect(input).toEqual(before);
  });
  it("does not guess ambiguous alias identities and displays every extra branch once", () => {
    const rows = buildTrackingRows(branches, [], month);
    const grouped = groupTrackingRows(rows);
    const displayed = grouped.flatMap((group) => group.rows.map((row) => row.branch_id));
    expect(displayed.sort()).toEqual(branches.map((b) => b.id).sort());
    expect(grouped.find((group) => group.name === "فروع إضافية")?.rows[0]?.branch_id).toBe("extra");
    expect(
      findTrackingRow("المعادي ١", [{ branch_name: "المعادي1" }, { branch_name: "معادي 1" }]),
    ).toBeUndefined();
  });
  it("handles FS/GHP/FSMS identically, keeps completion despite drafts and respects selected month", () => {
    for (const program of ["FS", "GHP", "FSMS"])
      for (const statuses of [
        ["draft", "submitted"],
        ["submitted", "draft"],
      ]) {
        const rows = buildTrackingRows(branches, [], month);
        const result = mergeTrackingAudits(rows, audits(statuses, program), month);
        const field = `${program.toLowerCase()}_status` as
          "fs_status" | "ghp_status" | "fsms_status";
        expect(result[0]![field]).toBe("completed");
        expect(result[0]!.audit_counts?.[program as "FS"]).toEqual({ submitted: 1, drafts: 1 });
        expect(result[1]![field]).toBe("not_started");
        expect(mergeTrackingAudits(rows, audits(["draft"], program), month)[0]![field]).toBe(
          "in_progress",
        );
        expect(
          mergeTrackingAudits(rows, audits(["submitted"], program, "a", "2026-09-15"), month)[0]![
            field
          ],
        ).toBe("not_started");
      }
  });
  it("shows Sodic East's September audit only in September and preserves manual states without audits", () => {
    const september = "2026-09-01";
    const visits = audits(["submitted"], "FS", "east", "2026-09-15");
    expect(
      mergeTrackingAudits(buildTrackingRows(branches, [], september), visits, september).find(
        (row) => row.branch_id === "east",
      )!.fs_status,
    ).toBe("completed");
    expect(
      mergeTrackingAudits(buildTrackingRows(branches, [], month), visits, month).find(
        (row) => row.branch_id === "east",
      )!.fs_status,
    ).toBe("not_started");
    expect(
      mergeTrackingAudits([{ ...saved, ghp_status: "completed" }], [], month)[0]!.ghp_status,
    ).toBe("completed");
  });
});

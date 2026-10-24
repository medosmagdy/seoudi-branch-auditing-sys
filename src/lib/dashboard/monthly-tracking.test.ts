import { describe, expect, it } from "vitest";
import { applyMonthlyAudits, findTrackingRow, trackingBranchKey, type TrackingRow } from "./monthly-tracking";
import { DASHBOARD_PROGRAM_IDS } from "./metrics";

const row: TrackingRow = { id: "tracking-1", branch_id: "maadi-1", branch_name: "المعادي 1", fs_status: "not_started", ghp_status: "not_started", fsms_status: "not_started" };
const audit = { branch_id: "maadi-1", branchName: "المعادي 1", audit_date: "2026-10-12", audit_type_id: DASHBOARD_PROGRAM_IDS.FS as string, typeName: "سلامة الغذاء", typeCode: "FS", status: "submitted" };

describe("monthly tracking", () => {
  it.each(["المعادي1", "المعادى ١", "فرع المعادي 1"])("matches %s without confusing Maadi 2 or dark store", (name) => {
    expect(findTrackingRow([{ ...row, branch_name: name }], "المعادي 1")?.id).toBe(row.id);
    expect(findTrackingRow([{ ...row, branch_name: name }], "المعادي 2")).toBeUndefined();
    expect(trackingBranchKey(name)).not.toBe(trackingBranchKey("دارك ستور المعادي"));
  });
  it.each(["معادي2", "معادى ٢", "فرع معادي 2", "المعادي 2"])("matches Maadi 2 alias %s without merging other branches", (name) => {
    const second = { ...row, id: "tracking-2", branch_id: "maadi-2", branch_name: name };
    expect(findTrackingRow([row, second], "المعادي 2")?.id).toBe(second.id);
    expect(findTrackingRow([second], "المعادي 1")).toBeUndefined();
    expect(findTrackingRow([second], "دارك ستور المعادي")).toBeUndefined();
  });
  it.each(["FS", "GHP", "FSMS"] as const)("shows completed %s for the seeded Maadi 2 name", (program) => {
    for (const branch_id of ["maadi-2", null]) {
      const second = { ...row, id: "tracking-2", branch_id, branch_name: "المعادي 2" };
      const secondAudit = { ...audit, branch_id: "maadi-2", branchName: "معادي2", audit_type_id: DASHBOARD_PROGRAM_IDS[program], typeCode: program };
      const rows = applyMonthlyAudits([second], [secondAudit], "2026-10");
      expect(findTrackingRow(rows, "معادي2")?.[`${program.toLowerCase()}_status` as "fs_status"]).toBe("completed");
    }
  });
  it("matches Sodic East spelling without including other Sodic branches", () => {
    const east = { ...row, branch_name: "سوديك إيست" };
    expect(findTrackingRow([east], "سوديك ايست")?.id).toBe(row.id);
    expect(findTrackingRow([east], "سوديك")).toBeUndefined();
    expect(findTrackingRow([east], "سوديك سيزر")).toBeUndefined();
  });
  it.each(["FS", "GHP", "FSMS"] as const)("recognizes %s by type ID even with Arabic labels", (program) => {
    const result = applyMonthlyAudits([row], [{ ...audit, audit_type_id: DASHBOARD_PROGRAM_IDS[program], typeCode: "", typeName: "قائمة مراجعة" }], "2026-10-01");
    expect(result[0][`${program.toLowerCase()}_status` as "fs_status"]).toBe("completed");
  });
  it("keeps submitted ahead of drafts regardless of query order", () => {
    const draft = { ...audit, status: "draft" };
    for (const audits of [[audit, draft], [draft, audit]]) {
      expect(applyMonthlyAudits([row], audits, "2026-10-01")[0].fs_status).toBe("completed");
    }
  });
  it("uses normalized names for legacy rows missing branch IDs", () => {
    expect(applyMonthlyAudits([{ ...row, branch_id: null, branch_name: "المعادى١" }], [audit], "2026-10")[0].fs_status).toBe("completed");
  });
  it("does not override a different explicit branch ID", () => {
    expect(applyMonthlyAudits([{ ...row, branch_id: "maadi-2" }], [audit], "2026-10")[0].fs_status).toBe("not_started");
  });
  it("ignores other months and preserves manual statuses without matching audits", () => {
    expect(applyMonthlyAudits([{ ...row, ghp_status: "completed" }], [audit], "2026-09")[0]).toEqual({ ...row, ghp_status: "completed" });
  });
  it("recomputes when audits arrive and does not mutate saved rows", () => {
    expect(applyMonthlyAudits([row], [], "2026-10")[0].fs_status).toBe("not_started");
    expect(applyMonthlyAudits([row], [{ ...audit, status: "draft" }], "2026-10")[0].fs_status).toBe("in_progress");
    expect(applyMonthlyAudits([row], [audit], "2026-10")[0].fs_status).toBe("completed");
    expect(row.fs_status).toBe("not_started");
  });
  it("does not let a duplicate unlinked tracking row hide completed audits", () => {
    const rows = applyMonthlyAudits([{ ...row, id: "legacy", branch_id: null }, { ...row, branch_name: "المعادي1" }], [audit], "2026-10");
    expect(findTrackingRow(rows, "المعادي 1")).toMatchObject({ id: row.id, fs_status: "completed" });
  });
});

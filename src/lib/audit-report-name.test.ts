import { describe, expect, it } from "vitest";
import { auditReportFileBase } from "./audit-report-name";
import { buildAuditWorkbook } from "./audit-workbook";
import { auditExportFixture } from "./__fixtures__/audit-export";

const identity = {
  branchName: "سيتي ستارز",
  branchNameEn: "City Stars",
  auditTypeName: "سلامة الغذاء",
  auditTypeNameEn: "Food Safety",
  auditDate: "2026-10-26",
};

describe("downloaded audit report names", () => {
  it("matches the requested FS, GHP and quarterly FSMS examples", () => {
    expect(auditReportFileBase({ ...identity, auditTypeCode: "FS" })).toBe(
      "CityStars FS Audit Report 26-10-2026",
    );
    expect(auditReportFileBase({ ...identity, auditTypeCode: "GHP" })).toBe(
      "CityStars GHP Audit Report 26-10-2026",
    );
    expect(
      auditReportFileBase({
        ...identity,
        branchNameEn: "Sheraton",
        auditTypeCode: "FSMS",
        auditDate: "2026-09-26",
      }),
    ).toBe("Sheraton FSMS Audit Report Q3-2026");
  });
  it.each([
    ["2026-01-01", "Q1-2026"],
    ["2026-03-31", "Q1-2026"],
    ["2026-04-01", "Q2-2026"],
    ["2026-07-01", "Q3-2026"],
    ["2026-10-01", "Q4-2026"],
    ["2027-01-01", "Q1-2027"],
  ])("uses the audit date %s for quarter %s", (auditDate, quarter) => {
    expect(auditReportFileBase({ ...identity, auditTypeCode: "FSMS", auditDate })).toContain(
      quarter,
    );
  });
  it("uses program names for older report models without a code", () => {
    expect(
      auditReportFileBase({ ...identity, auditTypeNameEn: "Food Safety Management System" }),
    ).toContain("FSMS Audit Report Q4-2026");
    expect(auditReportFileBase({ ...identity, auditTypeNameEn: "GHP" })).toContain(
      "GHP Audit Report 26-10-2026",
    );
  });
  it("keeps the stored branch name when English is unavailable and sanitizes filenames", () => {
    const name = auditReportFileBase({
      ...identity,
      branchName: "فرع تجريبي / 1",
      branchNameEn: null,
    });
    expect(name).toBe("فرع تجريبي 1 FS Audit Report 26-10-2026");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(auditReportFileBase({ ...identity, auditDate: "2026-02-31" })).toContain("Undated");
  });
  it("uses the same base name in the live-formula Excel without changing the result", () => {
    const model = { ...auditExportFixture(), ...identity, auditTypeCode: "FS" };
    const built = buildAuditWorkbook(model);
    expect(built.filename).toBe("CityStars FS Audit Report 26-10-2026.xlsx");
    expect(built.workbook.Sheets["البيانات"]![built.finalCell]!.v).toBe(
      model.result.finalPercentage / 100,
    );
  });
});

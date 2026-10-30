import { describe, it, expect } from "vitest";
import { reportBranchName } from "./report-branch-name";
import { auditReportFileBase } from "./audit-report-name";
import { reportFileName } from "./maintenance";
const mapping = [
  ["التجمع", "Silver Star"],
  ["الجامعة", "AUC"],
  ["مول العرب", "Mall Of Arabia"],
  ["مدينتي", "Madinaty"],
  ["سوديك", "Sodic"],
  ["سوديك سيزر", "Sodic Matcha"],
  ["سوديك ايست", "Sodic East"],
] as const;
describe("approved branch report identities", () => {
  it.each(mapping)("%s uses %s even with an outdated stored English name", (ar, en) => {
    expect(reportBranchName(ar, "Old English Name")).toBe(en);
    expect(
      auditReportFileBase({
        branchName: ar,
        branchNameEn: "Old English Name",
        auditTypeName: "سلامة الغذاء",
        auditTypeNameEn: "Food Safety",
        auditTypeCode: "FS",
        auditDate: "2026-10-26",
      }),
    ).toBe(`${en} FS Audit Report 26-10-2026`);
    expect(reportFileName(ar, "2026-09-01")).toBe(`${en} Maintenance Report Q3-2026`);
  });
  it("keeps East and Matcha distinct from Sodic and preserves unrelated names", () => {
    expect(reportBranchName("سوديك إيست")).toBe("Sodic East");
    expect(reportBranchName("روكسي", "Roxy")).toBe("Roxy");
    expect(reportBranchName("شيراتون")).toBe("Sheraton");
  });
});

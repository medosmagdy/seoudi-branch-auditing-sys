import { describe, expect, it } from "vitest";
import { canReadAudit, canViewDraftAudits, canEditAudit, canViewAllAudits } from "./permissions";
const owner = { userId: "self", createdBy: "self", auditorId: "self" };
describe("manager draft privacy without changing other audit access", () => {
  it("allows manager-owned drafts while hiding drafts owned by others", () => {
    for (const status of ["draft", "in_progress", "", null]) {
      expect(canReadAudit({ ...owner, role: "manager", status })).toBe(true);
      expect(
        canReadAudit({ ...owner, role: "manager", status, createdBy: "other", auditorId: "other" }),
      ).toBe(false);
      expect(canEditAudit({ ...owner, role: "manager", status })).toBe(true);
    }
    expect(canReadAudit({ ...owner, role: "manager" })).toBe(true);
    expect(canEditAudit({ ...owner, role: "manager" })).toBe(true);
    expect(canViewDraftAudits("manager")).toBe(true);
    expect(
      canReadAudit({
        ...owner,
        role: "manager",
        status: "submitted",
        createdBy: "other",
        auditorId: "other",
      }),
    ).toBe(true);
    expect(canEditAudit({ ...owner, role: "manager", status: "submitted" })).toBe(true);
    expect(
      canEditAudit({
        ...owner,
        role: "manager",
        status: "submitted",
        createdBy: "other",
        auditorId: "other",
      }),
    ).toBe(false);
    expect(canViewAllAudits("manager")).toBe(true);
  });
  it("retains admin access and auditor access to their own or assigned drafts", () => {
    expect(
      canReadAudit({
        ...owner,
        role: "admin",
        status: "draft",
        createdBy: "other",
        auditorId: "other",
      }),
    ).toBe(true);
    expect(canReadAudit({ ...owner, role: "auditor", status: "draft" })).toBe(true);
    expect(
      canReadAudit({
        ...owner,
        role: "auditor",
        status: "draft",
        createdBy: "other",
        auditorId: "other",
      }),
    ).toBe(false);
    expect(canViewDraftAudits("admin")).toBe(true);
    expect(canViewDraftAudits("auditor")).toBe(true);
  });
});

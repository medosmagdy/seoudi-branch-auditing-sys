import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: () => {} } }));
import { canReadAudit, canEditAudit } from "./permissions";
import { auditOwnerFilter } from "./audit-sharing";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  allowed = "00000000-0000-4000-8000-000000000003",
  hidden = "00000000-0000-4000-8000-000000000004";
describe("manager approved-audit branch scopes", () => {
  const input = {
    role: "manager" as const,
    userId: a,
    createdBy: b,
    auditorId: b,
    status: "submitted",
    branchId: allowed,
  };
  it("preserves unrestricted defaults and limits only explicitly restricted managers", () => {
    expect(canReadAudit(input)).toBe(true);
    expect(canReadAudit({ ...input, managerBranchIds: [allowed] })).toBe(true);
    expect(canReadAudit({ ...input, branchId: hidden, managerBranchIds: [allowed] })).toBe(false);
    expect(canReadAudit({ ...input, managerBranchIds: [] })).toBe(false);
    expect(canReadAudit({ ...input, status: "draft", managerBranchIds: [allowed] })).toBe(false);
    expect(canEditAudit(input)).toBe(false);
  });
  it("retains own audits and explicit sharing, even in an unlisted branch", () => {
    expect(canReadAudit({ ...input, createdBy: a, branchId: hidden, managerBranchIds: [] })).toBe(
      true,
    );
    expect(
      canReadAudit({ ...input, status: "draft", sharedUserIds: [b], managerBranchIds: [] }),
    ).toBe(true);
    expect(canReadAudit({ ...input, role: "admin", managerBranchIds: [] })).toBe(true);
  });
  it("restricts submitted rows in the server list query without broadening ownership", () => {
    expect(auditOwnerFilter(a, [], true, [allowed])).toContain(
      `and(status.eq.submitted,branch_id.in.(${allowed}))`,
    );
    expect(auditOwnerFilter(a, [], true, [])).not.toContain("status.eq.submitted");
  });
});

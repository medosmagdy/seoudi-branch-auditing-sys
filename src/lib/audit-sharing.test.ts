import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
import { auditOwnerFilter, loadAuditSharing, saveAuditShareGroup } from "./audit-sharing";
import { canReadAudit, canEditAudit } from "./permissions";
const a = "2735c9c6-07a2-4218-981f-a0467cf28e5b",
  b = "5f508e7b-e372-4951-a191-7db1f219def7",
  c = "00000000-0000-4000-8000-000000000003";
beforeEach(() => mock.rpc.mockReset());
describe("scoped peer audit access", () => {
  it("allows only directly shared owners for auditor and manager, including drafts", () => {
    for (const role of ["auditor", "manager"] as const)
      for (const status of ["draft", "submitted"]) {
        const input = { role, userId: a, createdBy: b, auditorId: b, status, sharedUserIds: [b] };
        expect(canReadAudit(input)).toBe(true);
        expect(canEditAudit(input)).toBe(true);
        expect(canEditAudit({ ...input, createdBy: c, auditorId: c })).toBe(false);
        if (status === "draft")
          expect(canReadAudit({ ...input, createdBy: c, auditorId: c })).toBe(false);
        expect(canEditAudit({ ...input, sharedUserIds: [] })).toBe(false);
      }
  });
  it("restricts the list query to self and validated peers", () => {
    expect(auditOwnerFilter(a, [b, b])).toBe(
      `auditor_id.eq.${a},created_by.eq.${a},auditor_id.eq.${b},created_by.eq.${b}`,
    );
    expect(auditOwnerFilter(a, [], true)).toContain("status.eq.submitted,");
    expect(() => auditOwnerFilter(a, ["bad,status.eq.draft"])).toThrow();
  });
  it("preserves base permissions when installation is not yet approved", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    expect(await loadAuditSharing()).toMatchObject({ installed: false, peers: [], groups: [] });
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    await expect(loadAuditSharing()).rejects.toThrow("تعذر");
  });
  it("does not accept malformed peer IDs or partial/failed saves", async () => {
    mock.rpc.mockResolvedValue({ data: { peers: ["not-a-uuid"], groups: [] }, error: null });
    await expect(loadAuditSharing()).rejects.toThrow();
    await expect(saveAuditShareGroup(null, "group", [a])).rejects.toThrow();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "Denied" } });
    await expect(saveAuditShareGroup(null, "group", [a, b])).rejects.toThrow("Denied");
    expect(mock.rpc).toHaveBeenLastCalledWith("sqop_set_audit_share_group", {
      p_group_id: null,
      p_name: "group",
      p_member_ids: [a, b],
    });
  });
});

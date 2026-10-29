import { beforeEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: network.fetch },
    }),
  };
});
import { addAuditDeduction, removeAuditDeduction } from "./audit-deductions";
beforeEach(() => {
  network.fetch.mockReset();
});
describe("deductions: validated writes with confirmed results", () => {
  it("rejects invalid amounts and empty reasons without sending writes", async () => {
    for (const value of [0, -1, 101, NaN, Infinity])
      await expect(addAuditDeduction({ auditId: "audit" }, "reason", value)).rejects.toThrow();
    await expect(addAuditDeduction({ auditId: "audit" }, "  ", 5)).rejects.toThrow();
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it("preserves fractional percentages, trims reasons and routes section/general writes", async () => {
    network.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: "deduction" }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    await addAuditDeduction({ auditId: "audit", sectionId: "section" }, " reason ", 0.5);
    expect(JSON.parse(network.fetch.mock.calls[0]![1].body)).toEqual({
      audit_id: "audit",
      section_id: "section",
      reason_text: "reason",
      percentage: 0.5,
    });
    expect(String(network.fetch.mock.calls[0]![0])).toContain("audit_section_deductions");
    await addAuditDeduction({ auditId: "audit" }, "reason", 100);
    expect(String(network.fetch.mock.calls[1]![0])).toContain("audit_general_deductions");
  });
  it("constrains deletion to the current audit and section", async () => {
    network.fetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "deduction" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await removeAuditDeduction({ auditId: "audit", sectionId: "section" }, "deduction");
    const url = new URL(String(network.fetch.mock.calls[0]![0]));
    expect(url.searchParams.get("audit_id")).toBe("eq.audit");
    expect(url.searchParams.get("section_id")).toBe("eq.section");
    expect(url.searchParams.get("id")).toBe("eq.deduction");
  });
  it("propagates denied and unconfirmed writes instead of clearing the form", async () => {
    network.fetch.mockResolvedValue(
      new Response(JSON.stringify({ code: "42501", message: "Denied" }), { status: 403 }),
    );
    await expect(addAuditDeduction({ auditId: "audit" }, "reason", 5)).rejects.toMatchObject({
      code: "42501",
    });
    network.fetch.mockResolvedValue(
      new Response("null", { headers: { "Content-Type": "application/json" } }),
    );
    await expect(removeAuditDeduction({ auditId: "audit" }, "missing")).rejects.toThrow("تأكيد");
  });
});

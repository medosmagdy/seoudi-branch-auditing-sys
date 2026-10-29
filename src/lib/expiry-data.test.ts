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
import { expiryDraftValues, loadExpiryRecords, type ExpiryDraft } from "./expiry-data";
import { cairoDate } from "./calendar-date";
const draft: ExpiryDraft = {
  date: "2026-10-24",
  branch: "branch",
  section: "عام",
  product: " product ",
  state: "صلاحية",
  deduction: "0",
  scope: "section",
  quantity: "",
  notes: " ",
};
beforeEach(() => {
  network.fetch.mockReset();
});
describe("expiry entry validation and complete reads", () => {
  it("preserves zero, nullable quantity, fractional deduction and text trimming", () => {
    expect(expiryDraftValues(draft)).toMatchObject({
      product_name: "product",
      quantity: null,
      deduction_percentage: 0,
      notes: null,
    });
    expect(expiryDraftValues({ ...draft, quantity: "0", deduction: "0.5" })).toMatchObject({
      quantity: 0,
      deduction_percentage: 0.5,
    });
    expect(expiryDraftValues({ ...draft, quantity: "12", deduction: "100" }).quantity).toBe(12);
  });
  it("rejects invalid dates, quantities and percentages before any write", () => {
    for (const patch of [
      { date: "" },
      { date: "2026-02-30" },
      { quantity: "-1" },
      { quantity: "1.5" },
      { quantity: "Infinity" },
      { deduction: "invalid" },
      { deduction: "101" },
      { deduction: "-1" },
      { product: " " },
      { scope: "invalid" },
    ])
      expect(() => expiryDraftValues({ ...draft, ...patch })).toThrow();
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it("uses the Cairo calendar day at UTC midnight/month boundaries", () => {
    expect(cairoDate(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(cairoDate(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02-01");
  });
  it("reads a later page instead of dropping the oldest records", async () => {
    network.fetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get("order")).toBe("expiry_date.desc,id.asc");
      const offset = Number(url.searchParams.get("offset"));
      return new Response(
        JSON.stringify(
          Array.from({ length: offset ? 1 : 500 }, (_, n) => ({ id: String(offset + n) })),
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    expect(await loadExpiryRecords()).toHaveLength(501);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });
});

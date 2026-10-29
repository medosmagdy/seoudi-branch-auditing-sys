import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: new Map<string, { id: string; auditor_id: string }>(),
  lost: false,
  denied: false,
  inserted: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (payload: { id: string; auditor_id: string }) => ({
        select: () => ({
          single: async () => {
            state.inserted.push(payload.id);
            if (state.denied) return { data: null, error: new Error("denied") };
            if (state.rows.has(payload.id))
              return { data: null, error: new Error("duplicate key") };
            state.rows.set(payload.id, payload);
            return state.lost
              ? { data: null, error: new Error("connection lost") }
              : { data: { id: payload.id }, error: null };
          },
        }),
      }),
      select: () => {
        const filters: Record<string, string> = {};
        const builder = {
          eq: (key: string, value: string) => {
            filters[key] = value;
            return builder;
          },
          maybeSingle: async () => {
            const row = state.rows.get(filters["id"]!);
            return { data: row?.auditor_id === filters["auditor_id"] ? row : null, error: null };
          },
        };
        return builder;
      },
    }),
  },
}));
import { insertAuditOnce } from "./audit-create";
beforeEach(() => {
  state.rows.clear();
  state.inserted = [];
  state.denied = false;
  state.lost = false;
});
describe("audit creation retries", () => {
  it("recovers a lost successful response and never creates a second audit on retry", async () => {
    state.lost = true;
    const payload = { id: "stable-id", auditor_id: "user" };
    expect(await insertAuditOnce(payload, "name")).toBe("stable-id");
    expect(await insertAuditOnce(payload, "name")).toBe("stable-id");
    expect(state.rows.size).toBe(1);
  });
  it("does not treat another auditor's existing UUID as this request", async () => {
    state.rows.set("stable-id", { id: "stable-id", auditor_id: "other" });
    await expect(insertAuditOnce({ id: "stable-id", auditor_id: "user" }, "name")).rejects.toThrow(
      "duplicate key",
    );
  });
  it("propagates write failures when the audit was not created", async () => {
    state.denied = true;
    await expect(insertAuditOnce({ id: "stable-id", auditor_id: "user" }, "name")).rejects.toThrow(
      "denied",
    );
    expect(state.rows.size).toBe(0);
  });
});

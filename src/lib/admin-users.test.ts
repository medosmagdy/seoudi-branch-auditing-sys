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
import { deleteUserAccount } from "./admin-users";
beforeEach(() => {
  network.fetch.mockReset();
});
describe("account deletion failure handling", () => {
  it("rejects deletion without an account or deletion of the current account before a request", async () => {
    await expect(deleteUserAccount("target", undefined)).rejects.toThrow("تسجيل الدخول");
    await expect(deleteUserAccount("self", "self")).rejects.toThrow("حسابك الحالي");
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it("uses the complete-account RPC and preserves errors without a destructive partial fallback", async () => {
    network.fetch.mockResolvedValue(
      new Response(JSON.stringify({ code: "42501", message: "Denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(deleteUserAccount("target", "admin")).rejects.toMatchObject({ code: "42501" });
    expect(network.fetch).toHaveBeenCalledOnce();
    expect(String(network.fetch.mock.calls[0]![0])).toContain("/rpc/delete_user_completely");
  });
  it("reports success only after the RPC succeeds", async () => {
    network.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteUserAccount("target", "admin")).resolves.toBeUndefined();
    expect(JSON.parse(network.fetch.mock.calls[0]![1].body)).toEqual({ target_user_id: "target" });
  });
});

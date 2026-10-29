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
import { loadAdminDirectory } from "./admin-directory";
import { loadChecklistTree } from "./checklist-data";
import { readAllPages } from "./query-pages";
const getUrl = (input: RequestInfo | URL) =>
  new URL(input instanceof Request ? input.url : String(input));
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  network.fetch.mockReset();
});
describe("complete admin reads and role failure handling", () => {
  it("loads more than 500 users and roles without treating a later role as missing", async () => {
    network.fetch.mockImplementation(async (input: string) => {
      const url = getUrl(input);
      const offset = Number(url.searchParams.get("offset"));
      const profiles = url.pathname.endsWith("/profiles");
      const rows = Array.from({ length: offset ? 1 : 500 }, (_, n) => {
        const id = String(offset + n);
        return profiles
          ? { id, email: `u${id}@example.test`, full_name: "", created_at: "2026-10-01" }
          : { user_id: id, role: offset ? "manager" : "auditor" };
      });
      return response(rows);
    });
    const users = await loadAdminDirectory();
    expect(users).toHaveLength(501);
    expect(users[500]).toMatchObject({ id: "500", role: "manager", full_name: "u500" });
    expect(network.fetch).toHaveBeenCalledTimes(4);
    for (const [url] of network.fetch.mock.calls)
      expect(getUrl(url).searchParams.get("order")).toBeTruthy();
  });
  it("rejects failed role reads rather than relabelling everyone as an auditor", async () => {
    network.fetch.mockImplementation(async (input: string) =>
      getUrl(input).pathname.endsWith("/user_roles")
        ? response({ code: "42501", message: "Denied" }, 403)
        : response([{ id: "admin", full_name: "Admin" }]),
    );
    await expect(loadAdminDirectory()).rejects.toMatchObject({ code: "42501" });
  });
  it("loads all questions with stable order and restricts headers to loaded sections", async () => {
    network.fetch.mockImplementation(async (input: string) => {
      const url = getUrl(input);
      if (url.pathname.endsWith("/sections")) return response([{ id: "section", order_index: 0 }]);
      if (url.pathname.endsWith("/headers")) {
        expect(url.searchParams.get("section_id")).toBe("in.(section)");
        return response([{ id: "header", order_index: 0, section_id: "section" }]);
      }
      expect(url.searchParams.get("audit_type_id")).toBe("eq.program");
      expect(url.searchParams.get("order")).toBe("item_order.asc,id.asc");
      const offset = Number(url.searchParams.get("offset"));
      return response(
        Array.from({ length: offset ? 1 : 500 }, (_, n) => ({ id: `q-${offset + n}` })),
      );
    });
    const tree = await loadChecklistTree("program");
    expect(tree.questions).toHaveLength(501);
    expect(tree.headers).toHaveLength(1);
  });
  it("does not return a partial checklist after a later page fails", async () => {
    network.fetch.mockImplementation(async (input: string) => {
      const url = getUrl(input);
      if (url.pathname.endsWith("/sections")) return response([]);
      return url.searchParams.get("offset") === "0"
        ? response(Array.from({ length: 500 }, (_, n) => ({ id: `q-${n}` })))
        : response({ message: "Failed page", code: "42501" }, 403);
    });
    await expect(loadChecklistTree("program")).rejects.toMatchObject({ code: "42501" });
    expect(network.fetch.mock.calls.every(([url]) => !String(url).includes("/headers"))).toBe(true);
  });
  it("honors cancellation before making a request", async () => {
    const controller = new AbortController();
    controller.abort();
    const page = vi.fn();
    await expect(readAllPages(page, controller.signal)).rejects.toThrow();
    expect(page).not.toHaveBeenCalled();
  });
});

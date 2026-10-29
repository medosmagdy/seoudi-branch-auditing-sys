import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.test", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: mock.fetch },
    }),
  };
});
import { dashboardErrorMessage, fetchDashboardSnapshot } from "./snapshot";
const filters = {
  scope: "branches" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  branch: "all",
};

describe("dashboard RPC using the real Supabase client with a mocked network", () => {
  beforeEach(() => {
    mock.fetch.mockReset();
  });
  it("keeps the client binding, reaches the RPC and forwards filters and cancellation", async () => {
    mock.fetch.mockResolvedValue(
      new Response(JSON.stringify({ version: 1, locations: [], audits: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const controller = new AbortController();
    await expect(fetchDashboardSnapshot(filters, controller.signal)).resolves.toEqual({
      version: 1,
      locations: [],
      audits: [],
    });
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mock.fetch.mock.calls[0]!;
    expect(String(url)).toContain("/rest/v1/rpc/sqop_dashboard_snapshot");
    expect(JSON.parse(init.body)).toEqual({
      p_scope: "branches",
      p_start: "2026-10-01",
      p_end: "2026-10-31",
      p_branch: null,
    });
    expect(init.signal).toBe(controller.signal);
  });
  it("preserves a database error for diagnosis instead of inventing empty dashboard data", async () => {
    mock.fetch.mockResolvedValue(
      new Response(JSON.stringify({ code: "PGRST202", message: "Function not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchDashboardSnapshot(filters)).rejects.toMatchObject({
      code: "PGRST202",
      message: "Function not found",
    });
  });
  it("shows the error message/code without serializing other fields or credentials", () => {
    expect(
      dashboardErrorMessage({
        code: "42501",
        message: "Dashboard access denied",
        token: "do-not-display",
      }),
    ).toBe("[42501] Dashboard access denied");
    expect(dashboardErrorMessage(new TypeError("Request failed"))).toBe("Request failed");
  });
});

it("filters non-submitted snapshot entries before manager data enters the cache while preserving admin output", async () => {
  const audit = {
    id: "submitted",
    date: "2026-10-01",
    status: "submitted",
    branchId: "branch",
    branchName: "Branch",
    type: { id: "FS", code: "FS", name_ar: "FS", name_en: null },
    generalDeduction: 0,
    sections: [],
  };
  mock.fetch.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          version: 1,
          locations: [],
          audits: [audit, { ...audit, id: "draft", status: "draft" }],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  expect(
    (await fetchDashboardSnapshot({ ...filters, submittedOnly: true })).audits.map((a) => a.id),
  ).toEqual(["submitted"]);
  expect((await fetchDashboardSnapshot(filters)).audits.map((a) => a.id)).toEqual([
    "submitted",
    "draft",
  ]);
});

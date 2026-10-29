import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: state.fetch },
    }),
  };
});
import { loadSlaughterReports, saveSlaughterReport } from "./slaughter-data";

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (url: string, options: RequestInit) => {
    const select = new URL(url).searchParams.get("select") ?? "";
    if (select.includes("slaughtering_evaluation"))
      return new Response(
        JSON.stringify({
          message: "column slaughter_reports.slaughtering_evaluation does not exist",
          code: "42703",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    const row = { id: "report", meat_score: 88, report_details: { version: 1, score: 0 } };
    return new Response(
      JSON.stringify(options.method === "POST" || options.method === "PATCH" ? row : [row]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
});
describe("slaughter reports deployed schema compatibility", () => {
  it("loads without requesting the nonexistent evaluation column", async () => {
    const rows = await loadSlaughterReports();
    expect(rows[0]).toMatchObject({ meat_score: 88, report_details: { score: 0 } });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    const url = new URL(state.fetch.mock.calls[0]![0]);
    expect(url.searchParams.get("select")).not.toContain("slaughtering_evaluation");
    expect(url.searchParams.get("select")).toContain("report_details");
  });
  it("returns a saved report without the missing column in POST returning", async () => {
    const payload = { report_date: "2026-10-24", report_details: { version: 1, score: 0 } };
    const result = await saveSlaughterReport(payload);
    expect(result.error).toBeNull();
    expect(result.data.report_details.score).toBe(0);
    expect(JSON.parse(state.fetch.mock.calls[0]![1].body)).toEqual(payload);
    expect(new URL(state.fetch.mock.calls[0]![0]).searchParams.get("select")).not.toContain(
      "slaughtering_evaluation",
    );
  });
  it("updates only the chosen draft and preserves the original creator", async () => {
    const result = await saveSlaughterReport(
      { report_details: { version: 2, score: null }, created_by: "new-admin" },
      "existing-id",
    );
    expect(result.error).toBeNull();
    const [request, options] = state.fetch.mock.calls[0]!;
    expect(options.method).toBe("PATCH");
    const url = new URL(request);
    expect(url.searchParams.get("id")).toBe("eq.existing-id");
    expect(url.searchParams.get("status")).toBe("eq.draft");
    expect(JSON.parse(options.body)).not.toHaveProperty("created_by");
  });
  it("surfaces genuine read errors instead of silently returning empty reports", async () => {
    state.fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: "permission denied", code: "42501" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(loadSlaughterReports()).rejects.toMatchObject({ code: "42501" });
  });
});

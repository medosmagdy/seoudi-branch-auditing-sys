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
import { fetchMonthlyTracking, updateMonthlyTracking } from "./tracking";
import type { MonthlyTrackingRow } from "./tracking-model";
const row: MonthlyTrackingRow = {
  id: "saved",
  branch_id: "a",
  branch_name: "المعادي1",
  tracking_month: "2026-10-01",
  fs_status: "not_started",
  ghp_status: "not_started",
  fsms_status: "not_started",
  updated_at: "",
  persisted: true,
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  mock.fetch.mockReset();
});
describe("monthly tracking data access", () => {
  it("only reads on page load, forwards selected month/cancellation and paginates", async () => {
    // PostgREST uses offset/limit query parameters for range, not a write request.
    mock.fetch.mockImplementation(async (url) =>
      response(
        new URL(
          url instanceof Request
            ? url.url
            : typeof url === "object" && url !== null && "url" in url
              ? String(url.url)
              : String(url),
        ).searchParams.get("offset") === "500"
          ? [row]
          : Array.from({ length: 500 }, (_, n) => ({ ...row, id: String(n) })),
      ),
    );
    const controller = new AbortController();
    expect(await fetchMonthlyTracking(row.tracking_month, controller.signal)).toHaveLength(501);
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of mock.fetch.mock.calls) {
      expect(init.method ?? "GET").toBe("GET");
      expect(String(url)).toContain("tracking_month=eq.2026-10-01");
      expect(init.signal).toBe(controller.signal);
    }
  });
  it("throws read errors rather than inventing not-started rows", async () => {
    mock.fetch.mockResolvedValue(response({ code: "42501", message: "Forbidden" }, 403));
    await expect(fetchMonthlyTracking(row.tracking_month)).rejects.toMatchObject({ code: "42501" });
  });
  it("updates exactly one saved row in the selected month and verifies success", async () => {
    mock.fetch.mockResolvedValue(response({ id: row.id }));
    await updateMonthlyTracking(row, "fs_status", "completed", row.tracking_month);
    const [url, init] = mock.fetch.mock.calls[0]!;
    expect(init.method).toBe("PATCH");
    expect(String(url)).toContain("id=eq.saved");
    expect(String(url)).toContain("tracking_month=eq.2026-10-01");
    expect(JSON.parse(init.body)).toMatchObject({ fs_status: "completed" });
    expect(JSON.parse(init.body)).not.toHaveProperty("ghp_status");
  });
  it("initializes a missing row only on an explicit manual update", async () => {
    mock.fetch.mockResolvedValue(response({ id: "new" }, 201));
    await updateMonthlyTracking(
      { ...row, persisted: false },
      "ghp_status",
      "in_progress",
      row.tracking_month,
    );
    const [, init] = mock.fetch.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      branch_id: "a",
      branch_name: "المعادي1",
      tracking_month: "2026-10-01",
      ghp_status: "in_progress",
    });
  });
  it("surfaces a denied or zero-row write and rejects stale month/invalid status before writing", async () => {
    mock.fetch.mockResolvedValue(response({ code: "PGRST116", message: "No rows" }, 406));
    await expect(
      updateMonthlyTracking(row, "fs_status", "completed", row.tracking_month),
    ).rejects.toMatchObject({ code: "PGRST116" });
    mock.fetch.mockClear();
    await expect(
      updateMonthlyTracking(row, "fs_status", "completed", "2026-09-01"),
    ).rejects.toThrow("متطابقة");
    await expect(
      updateMonthlyTracking(row, "fs_status", "invalid", row.tracking_month),
    ).rejects.toThrow("غير صحيحة");
    await expect(
      updateMonthlyTracking(
        { ...row, audit_counts: { FS: { submitted: 1, drafts: 0 } } },
        "fs_status",
        "not_started",
        row.tracking_month,
      ),
    ).rejects.toThrow("تلقائيًا");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
});

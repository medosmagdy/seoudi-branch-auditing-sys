import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  auth: vi.fn(),
  rows: new Map<string, { kind: string; name: string; created_by: string }>(),
  fail: false,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: state.fetch },
  });
  return { supabase: { auth: { getUser: state.auth }, from: client.from.bind(client) } };
});
import {
  addSlaughterLocation,
  loadSlaughterLocations,
  slaughterLocationOptions,
  slaughterLocationError,
} from "./slaughter-locations";
beforeEach(() => {
  state.rows.clear();
  state.fail = false;
  state.auth.mockReset();
  state.auth.mockResolvedValue({ data: { user: { id: "admin" } }, error: null });
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (url: string, options: RequestInit) => {
    const headers = { "Content-Type": "application/json" };
    if (state.fail)
      return new Response(JSON.stringify({ code: "42501", message: "permission denied" }), {
        status: 403,
        headers,
      });
    if (options.method === "POST") {
      const row = JSON.parse(options.body as string);
      const key = `${row.kind}:${row.name}`;
      if (!state.rows.has(key)) state.rows.set(key, row);
      return new Response(null, { status: 201, headers });
    }
    const params = new URL(url).searchParams;
    const kind = params.get("kind")?.replace(/^eq\./, ""),
      name = params.get("name")?.replace(/^eq\./, "");
    if (kind && name) {
      const row = state.rows.get(`${kind}:${name}`);
      return new Response(JSON.stringify(row ? { name: row.name } : null), {
        status: 200,
        headers,
      });
    }
    return new Response(
      JSON.stringify([...state.rows.values()].map(({ kind, name }) => ({ kind, name }))),
      { status: 200, headers },
    );
  });
});
describe("slaughter location persistence", () => {
  it("persists a trimmed name with its correct kind and confirms it can be loaded", async () => {
    expect(await addSlaughterLocation("farm", "  مزرعة  جديدة  ")).toBe("مزرعة جديدة");
    expect(state.rows.get("farm:مزرعة جديدة")).toMatchObject({
      kind: "farm",
      name: "مزرعة جديدة",
      created_by: "admin",
    });
    expect(await loadSlaughterLocations()).toEqual([{ kind: "farm", name: "مزرعة جديدة" }]);
  });
  it("keeps farms separate from slaughterhouses and does not overwrite an existing creator", async () => {
    state.rows.set("farm:Family", { kind: "farm", name: "Family", created_by: "original" });
    await addSlaughterLocation("farm", "Family");
    await addSlaughterLocation("slaughterhouse", "Family");
    expect(state.rows.size).toBe(2);
    expect(state.rows.get("farm:Family")?.created_by).toBe("original");
    expect(new Headers(state.fetch.mock.calls[0]![1].headers).get("prefer")).toContain(
      "resolution=ignore-duplicates",
    );
  });
  it("does not claim success after a write failure", async () => {
    state.fail = true;
    await expect(addSlaughterLocation("farm", "new")).rejects.toMatchObject({ code: "42501" });
    expect(state.rows.size).toBe(0);
  });
  it("requires authentication and rejects empty or overlong names before writing", async () => {
    await expect(addSlaughterLocation("farm", " ")).rejects.toThrow("اسمًا");
    await expect(addSlaughterLocation("farm", "a".repeat(121))).rejects.toThrow("اسمًا");
    state.auth.mockResolvedValue({ data: { user: null }, error: null });
    await expect(addSlaughterLocation("farm", "new")).rejects.toThrow("تسجيل الدخول");
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("normalizes duplicate display names and explains missing tables separately from permissions", () => {
    expect(slaughterLocationOptions([" Family ", "family", "Al  Salam", "", "Al Salam"])).toEqual([
      "Al Salam",
      "Family",
    ]);
    expect(slaughterLocationError({ code: "PGRST205" })).toContain("تهيئة");
    expect(slaughterLocationError({ code: "42501" })).toContain("صلاحية");
  });
});

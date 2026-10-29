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
import {
  loadAuditNaDefaults,
  initializeAuditNa,
  mergeAuditDefaults,
  saveAuditNaDefaults,
  type NaAnswer,
  type NaStatus,
} from "./audit-na";
const audit = {
  id: "new",
  branch_id: "branch",
  audit_type_id: "FS",
  audit_date: "2026-10-24",
  created_at: "2026-10-24T10:00:00Z",
  status: "draft",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  network.fetch.mockReset();
});
describe("N/A carry-over across partial saves", () => {
  it("merges by question/section rather than losing every inherited value on the first save", () => {
    const inherited: NaAnswer[] = [{ question_id: "na", score: null, is_na: true, comment: "" }];
    const saved: NaAnswer[] = [{ question_id: "edited", score: 0, is_na: false, comment: "" }];
    expect(mergeAuditDefaults(inherited, saved, (row) => row.question_id)).toEqual([
      ...inherited,
      ...saved,
    ]);
    const statuses: NaStatus[] = [{ section_id: "excluded", is_na: true }];
    expect(
      mergeAuditDefaults(
        statuses,
        [{ section_id: "another", is_na: false }],
        (row) => row.section_id,
      ),
    ).toHaveLength(2);
    expect(
      mergeAuditDefaults(
        statuses,
        [{ section_id: "excluded", is_na: false }],
        (row) => row.section_id,
      ),
    ).toEqual([{ section_id: "excluded", is_na: false }]);
    expect(
      mergeAuditDefaults(
        inherited,
        [{ question_id: "na", score: 0, is_na: false, comment: "changed" }],
        (row) => row.question_id,
      )[0],
    ).toMatchObject({ score: 0, is_na: false });
  });
  it("keeps prior reads branch/program scoped and older than the current audit", async () => {
    network.fetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/audits")) {
        expect(url.searchParams.get("branch_id")).toBe("eq.branch");
        expect(url.searchParams.get("audit_type_id")).toBe("eq.FS");
        expect(url.searchParams.get("audit_date")).toBe("lte.2026-10-24");
        expect(url.searchParams.get("created_at")).toBe("lt.2026-10-24T10:00:00Z");
        return json({ id: "previous" });
      }
      expect(url.searchParams.get("audit_id")).toBe("eq.previous");
      expect(url.searchParams.get("is_na")).toBe("eq.true");
      return json(
        url.pathname.endsWith("/audit_answers")
          ? [{ question_id: "na", score: null, is_na: true, comment: null }]
          : [{ section_id: "excluded", is_na: true }],
      );
    });
    expect(await loadAuditNaDefaults(audit)).toMatchObject({
      answers: [{ question_id: "na" }],
      statuses: [{ section_id: "excluded" }],
    });
    expect(network.fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("never dynamically changes a submitted audit from a later/default source", async () => {
    expect(await loadAuditNaDefaults({ ...audit, status: "submitted" })).toEqual({
      answers: [],
      statuses: [],
    });
    expect(network.fetch).not.toHaveBeenCalled();
  });
  it("uses insert-only conflict handling so explicitly clearing N/A remains saved", async () => {
    network.fetch.mockResolvedValue(new Response(null, { status: 201 }));
    await saveAuditNaDefaults("new", {
      answers: [{ question_id: "na", score: null, is_na: true, comment: null }],
      statuses: [{ section_id: "excluded", is_na: true }],
    });
    expect(network.fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of network.fetch.mock.calls)
      expect(new Headers(init.headers).get("Prefer")).toContain("resolution=ignore-duplicates");
  });
  it("surfaces failed inheritance reads instead of silently treating N/A as full credit", async () => {
    network.fetch.mockResolvedValue(json({ message: "Denied", code: "42501" }, 403));
    await expect(loadAuditNaDefaults(audit)).rejects.toMatchObject({ code: "42501" });
  });
});

it("copies active N/A defaults as part of explicit audit creation before the runner opens", async () => {
  network.fetch.mockImplementation(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    if (init.method === "POST") return new Response(null, { status: 201 });
    if (url.pathname.endsWith("/audits"))
      return json(url.searchParams.get("id") === "eq.new" ? audit : { id: "previous" });
    if (url.pathname.endsWith("/audit_answers")) {
      expect(url.searchParams.get("questions.active")).toBe("eq.true");
      return json([{ question_id: "na", score: null, is_na: true, comment: null }]);
    }
    expect(url.searchParams.get("sections.active")).toBe("eq.true");
    return json([{ section_id: "excluded", is_na: true }]);
  });
  await initializeAuditNa("new");
  const writes = network.fetch.mock.calls.filter(([, init]) => init.method === "POST");
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[0]![1].body)).toEqual([
    { audit_id: "new", question_id: "na", is_na: true, score: null, comment: null },
  ]);
});

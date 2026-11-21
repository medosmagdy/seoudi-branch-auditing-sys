import { expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.test", "key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fake.fetch },
    }),
  };
});
vi.mock("@/lib/photos", () => ({ loadAuditPhotoUrls: async () => ({}) }));
import { loadReportModel } from "./report-data";

it("uses report scores consistently for each month's own data, keeping existing month aggregation", async () => {
  const row = (id: string, audit_date: string, score: number) => ({
    id,
    audit_date,
    score,
    overall_score: score,
  });
  const october = row("oct", "2026-10-07", 94.09);
  const current = {
    ...row("nov", "2026-11-16", 92.47),
    branch_id: "sodic",
    audit_type_id: "fs",
    status: "submitted",
    branches: { name_ar: "سوديك", code: "30" },
    audit_types: { code: "FS", name_ar: "سلامة الغذاء" },
  };
  const otherMonth = row("legacy", "2026-09-03", 90);
  const otherVisit = row("sep2", "2026-09-19", 80);
  fake.fetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    const select = url.searchParams.get("select");
    let data: unknown = [];
    switch (url.pathname.split("/").at(-1)) {
      case "audits":
        if (select?.includes("branches(")) data = current;
        else {
          expect(url.searchParams.get("branch_id")).toBe("eq.sodic");
          expect(url.searchParams.get("audit_type_id")).toBe("eq.fs");
          expect(url.searchParams.get("status")).toBe("eq.submitted");
          data = [otherMonth, otherVisit, october, current, row("other-nov", "2026-11-01", 80)];
        }
        break;
      case "sections":
        data = [{ id: "food", name_ar: "سلامة الغذاء", is_delivery: false }];
        break;
      case "questions":
        data = [{ id: "q1", section_id: "food", max_score: 10000 }];
        break;
      case "audit_answers":
        if (url.searchParams.get("audit_id") === "eq.nov") {
          data = [{ question_id: "q1", score: 9409, is_na: false }];
        } else {
          expect(url.searchParams.get("audit_id")).toBe("in.(legacy,sep2,oct)");
          data =
            url.searchParams.get("offset") === "500"
              ? [{ audit_id: "oct", question_id: "q1", score: 7447, is_na: false }]
              : [
                  // Older inactive questions may fill a whole page, while the
                  // current scoring question is on the next one.
                  ...Array.from({ length: 499 }, (_, i) => ({
                    audit_id: "oct",
                    question_id: `inactive-${i}`,
                    score: 4,
                    is_na: false,
                  })),
                  { audit_id: "sep2", question_id: "q1", score: 0, is_na: false },
                ];
        }
        break;
      case "audit_general_deductions":
        if (url.searchParams.get("audit_id") !== "eq.nov")
          data = [{ audit_id: "oct", percentage: 2 }];
        break;
      case "profiles":
        data = { full_name: "Reviewer" };
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
  const model = await loadReportModel("nov", { includePhotos: false });
  expect(model.result.finalPercentage).toBe(94.09);
  expect(model.history).toEqual([
    { month: "2026-09", score: 45 },
    { month: "2026-10", score: 72.47 },
    { month: "2026-11", score: 94.09 },
  ]);
  expect(fake.fetch.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});

it.each(["list", "answers"])(
  "keeps the current audit available when historical %s fail",
  async (failure) => {
    fake.fetch.mockReset();
    fake.fetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const table = url.pathname.split("/").at(-1);
      const auditId = url.searchParams.get("audit_id");
      const reply = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      const networkFailure = () => reply({ code: "42501", message: "Access denied" }, 403);
      if (table === "audits") {
        if (url.searchParams.get("id") === "eq.current")
          return reply({
            id: "current",
            audit_date: "2026-11-20",
            status: "submitted",
            branch_id: "branch",
            audit_type_id: "fs",
          });
        if (failure === "list") return networkFailure();
        return reply([{ id: "older", audit_date: "2026-10-20", score: 94 }]);
      }
      if (table === "sections") return reply([{ id: "section", name_ar: "الأسماك" }]);
      if (table === "questions") return reply([{ id: "q1", section_id: "section", max_score: 4 }]);
      if (table === "audit_answers")
        return auditId === "eq.current"
          ? reply([{ question_id: "q1", score: 2, is_na: false }])
          : networkFailure();
      if (table === "profiles") return reply({ full_name: "Reviewer" });
      return reply([]);
    });
    const model = await loadReportModel("current", { includePhotos: false });
    expect(model.result.finalPercentage).toBe(50);
    expect(model.history).toEqual([]);
    expect(model.historyUnavailable).toBe(true);
  },
);

it("includes active scoring questions and their headers after the first results page", async () => {
  fake.fetch.mockReset();
  fake.fetch.mockImplementation(async (input: string) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    const offset = Number(url.searchParams.get("offset"));
    let data: unknown = [];
    if (table === "audits")
      data = {
        id: "large",
        audit_date: "2026-11-20",
        status: "submitted",
        branch_id: "branch",
        audit_type_id: "fs",
      };
    if (table === "sections") data = [{ id: "section", name_ar: "الأسماك", order_index: 0 }];
    if (table === "questions") {
      expect(url.searchParams.get("active")).toBe("eq.true");
      expect(url.searchParams.get("order")).toBe("item_order.asc,id.asc");
      data = Array.from({ length: offset ? 1 : 500 }, (_, index) => ({
        id: `q-${offset + index}`,
        section_id: "section",
        header_id: offset ? "late-header" : null,
        max_score: 4,
      }));
    }
    if (table === "headers") {
      expect(url.searchParams.get("section_id")).toBe("in.(section)");
      data = [
        { id: "late-header", section_id: "section", label_ar: "بنود إضافية", order_index: 0 },
      ];
    }
    if (table === "audit_answers") data = [{ question_id: "q-500", score: 0, is_na: false }];
    if (table === "profiles") data = { full_name: "Reviewer" };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const model = await loadReportModel("large", { includePhotos: false, includeHistory: false });
  expect(model.result.overallMax).toBe(2004);
  expect(model.result.finalPercentage).toBe(99.8);
  expect(model.ncrs).toMatchObject([{ id: "q-500", headerLabel: "بنود إضافية" }]);
});

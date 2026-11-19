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
vi.mock("@/lib/photos", () => ({ signedPhotoUrls: async () => ({}) }));
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

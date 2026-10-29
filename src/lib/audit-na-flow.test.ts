import { describe, expect, it, vi } from "vitest";
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
import { finalizeAudit } from "./finalize-audit";
import { buildAuditWorkbook } from "./audit-workbook";

it("retains inherited question/section N/A through a partial zero save, summary, submission, reload and Excel export", async () => {
  const audit = {
    id: "new",
    status: "draft",
    version: 1,
    audit_date: "2026-10-24",
    created_at: "2026-10-24T10:00:00Z",
    audit_type_id: "FS",
    branch_id: "branch",
    auditor_id: "user",
    created_by: "user",
    branch_manager: "Manager",
    branches: { name_ar: "فرع تجريبي", code: "TEST" },
    audit_types: { name_ar: "FS", name_en: "FS" },
  };
  const answers = [
    { question_id: "q-zero", score: 0 as number | null, is_na: false, comment: null },
  ];
  const statuses = [{ section_id: "food", is_na: false }];
  const sections = [
    {
      id: "food",
      audit_type_id: "FS",
      name_ar: "سلامة الغذاء",
      name_en: null,
      is_delivery: false,
      active: true,
      order_index: 0,
    },
    {
      id: "excluded",
      audit_type_id: "FS",
      name_ar: "قسم مستبعد",
      name_en: null,
      is_delivery: false,
      active: true,
      order_index: 1,
    },
  ];
  const questions = [
    { id: "q-na", section_id: "food" },
    { id: "q-zero", section_id: "food" },
    { id: "q-excluded", section_id: "excluded" },
  ].map((q) => ({
    ...q,
    audit_type_id: "FS",
    item_id: q.id,
    text_ar: q.id,
    max_score: 4,
    header_id: null,
    active: true,
    item_order: 0,
  }));
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  let sourceChanged = false;
  fake.fetch.mockImplementation(async (input: string, init: RequestInit) => {
    const url = new URL(input),
      table = url.pathname.split("/").at(-1),
      select = url.searchParams.get("select") || "";
    if (init.method === "POST") {
      const rows = JSON.parse(String(init.body));
      expect(new Headers(init.headers).get("Prefer")).toContain("resolution=ignore-duplicates");
      if (table === "audit_answers")
        for (const row of rows) {
          if (!answers.some((q) => q.question_id === row.question_id)) answers.push(row);
        }
      if (table === "audit_section_status")
        for (const row of rows) {
          if (!statuses.some((s) => s.section_id === row.section_id)) statuses.push(row);
        }
      return new Response(null, { status: 201 });
    }
    if (init.method === "PATCH") {
      audit.status = "submitted";
      return json({ id: audit.id });
    }
    if (table === "audits") {
      if (select === "id") return json(sourceChanged ? null : { id: "previous" });
      if (select.includes("branches(")) return json(audit);
      return json([]);
    }
    if (table === "sections") return json(sections);
    if (table === "questions") return json(questions);
    if (table === "profiles") return json({ full_name: "Auditor", email: "test@example.test" });
    if (table === "audit_answers")
      return json(
        url.searchParams.get("audit_id") === "eq.previous"
          ? [{ question_id: "q-na", score: null, is_na: true, comment: null }]
          : answers,
      );
    if (table === "audit_section_status")
      return json(
        url.searchParams.get("audit_id") === "eq.previous"
          ? [{ section_id: "excluded", is_na: true }]
          : statuses,
      );
    return json([]);
  });
  const summary = await loadReportModel("new", { includePhotos: false });
  expect(
    summary.sections
      .find((s) => s.id === "food")!
      .groups[0]!.questions.find((q) => q.id === "q-na")!.isNa,
  ).toBe(true);
  expect(summary.sections.find((s) => s.id === "excluded")!.excluded).toBe(true);
  expect(summary.result.overallMax).toBe(4);
  expect(summary.result.finalPercentage).toBe(0);
  expect(fake.fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  await finalizeAudit("new");
  expect(answers.find((q) => q.question_id === "q-zero")!.score).toBe(0);
  expect(answers.find((q) => q.question_id === "q-na")).toMatchObject({ score: null, is_na: true });
  expect(statuses.find((s) => s.section_id === "excluded")!.is_na).toBe(true);
  sourceChanged = true;
  const reopened = await loadReportModel("new", { includePhotos: false });
  expect(reopened.result.overallMax).toBe(4);
  expect(reopened.sections.find((s) => s.id === "excluded")!.excluded).toBe(true);
  const exported = buildAuditWorkbook(reopened),
    q = exported.inputs.find((q) => q.questionId === "q-na")!;
  expect(exported.workbook.Sheets[q.sheet]![q.naCell]!.v).toBe("N/A");
  expect(exported.workbook.Sheets["البيانات"]![exported.finalCell]!.v).toBe(0);
});

import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ write: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://example.test", "key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: mocks.fetch },
    }),
  };
});
vi.mock("xlsx-js-style", async () => {
  const mod = await vi.importActual<typeof import("xlsx-js-style")>("xlsx-js-style");
  const library = (mod as unknown as { default?: typeof mod }).default ?? mod;
  return { ...mod, default: { ...library, writeFile: mocks.write } };
});
import XLSX from "xlsx-js-style";
import { downloadDashboardWorkbook, loadDashboardDeductions } from "./download";
import { detailFixture } from "./__fixtures__/detail-data";
import { buildDashboardDetails } from "./detail-model";
import { aggregateDashboard } from "./snapshot";

describe("warehouse aggregate Excel download", () => {
  it("generates real workbook bytes with warehouse-specific program IDs and invokes the download", () => {
    const { data, snapshot } = detailFixture(1);
    const mapping = new Map(data.auditTypes.map((type) => [type.id, `warehouse-${type.code}`]));
    for (const type of data.auditTypes) {
      type.id = mapping.get(type.id)!;
      type.code = `${type.code} (WH)`;
    }
    for (const section of data.sections)
      section.audit_type_id = mapping.get(section.audit_type_id)!;
    for (const question of data.questions)
      question.audit_type_id = mapping.get(question.audit_type_id)!;
    for (const audit of data.audits) {
      audit.audit_type_id = mapping.get(audit.audit_type_id)!;
      audit.branchName = "المخازن المركزية";
    }
    for (const branch of data.branches) branch.name_ar = "المخازن المركزية";
    data.sections[0]!.name_ar = "التخزين الجاف";
    const filteredData = buildDashboardDetails({
      data,
      snapshot,
      profile: { id: "user" },
      canViewAll: true,
      branchFilter: "all",
      startDate: "",
      endDate: "",
    })!;
    const summary = aggregateDashboard(snapshot, {
      scope: "branches",
      start: "",
      end: "",
      branch: "all",
    });
    downloadDashboardWorkbook(
      { data, filteredData, summary, genDeductions: [], secDeductions: [], scope: "warehouses" },
      "warehouse.xlsx",
    );
    const [wb, name] = mocks.write.mock.calls.at(-1)!;
    expect(name).toBe("warehouse.xlsx");
    expect(wb.SheetNames).toContain("المخازن والزيارات");
    expect(JSON.stringify(wb.Sheets["المخازن والزيارات"])).toContain("التخزين الجاف");
    expect(JSON.stringify(wb.Sheets["المخازن والزيارات"])).not.toContain("قسم الأسماك");
    const indicator = XLSX.utils.sheet_to_json(wb.Sheets["FS - أقسام"], {
      header: 1,
    }) as unknown[][];
    expect(indicator.length).toBeGreaterThan(3);
    expect(
      JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets["المخازن والزيارات"], { header: 1 })),
    ).toContain("المخازن المركزية");
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(XLSX.read(bytes, { type: "buffer" }).SheetNames).toContain("المخازن والزيارات");
  });
  it("loads deductions only for exported audits and surfaces failures", async () => {
    mocks.fetch.mockImplementation(async (input: string) => {
      expect(new URL(input).searchParams.get("audit_id")).toBe("in.(allowed)");
      return new Response(JSON.stringify({ message: "Denied", code: "42501" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    });
    await expect(loadDashboardDeductions(["allowed"])).rejects.toMatchObject({ code: "42501" });
  });
});

it("downloads an audit aggregate with no discrepancies instead of styling a missing header cell", () => {
  const { data, snapshot } = detailFixture(1);
  for (const answer of data.answers) {
    answer.score = 4;
    answer.comment = null;
  }
  const filteredData = buildDashboardDetails({
    data,
    snapshot,
    profile: { id: "user" },
    canViewAll: true,
    branchFilter: "all",
    startDate: "",
    endDate: "",
  })!;
  expect(() =>
    downloadDashboardWorkbook(
      {
        data,
        filteredData,
        summary: null,
        genDeductions: [],
        secDeductions: [],
        scope: "warehouses",
      },
      "no-issues.xlsx",
    ),
  ).not.toThrow();
  const [wb] = mocks.write.mock.calls.at(-1)!;
  expect(wb.Sheets["سجل الملاحظات"].A1.v).toBe("كود الفحص");
  expect(wb.Sheets["سجل الملاحظات"].B1.v).toBe("المخزن");
});

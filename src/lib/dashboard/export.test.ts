import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import * as XLSX from "xlsx-js-style";
import { buildDashboardWorkbook } from "./export";
import { buildDashboardWorkbook as beforeWorkbook } from "./__fixtures__/pre-refactor-export";
import { buildDashboardDetails } from "./detail-model";
import { aggregateDashboard } from "./snapshot";
import { detailFixture } from "./__fixtures__/detail-data";

describe("dashboard Excel behavior before and after refactoring", () => {
  it("preserves the workbook except for the final score cells of submitted visits", () => {
    for (let seed = 0; seed < 4; seed++) {
      const { data, snapshot } = detailFixture(seed);
      const filteredData = buildDashboardDetails({
        data,
        snapshot,
        profile: { id: "user" },
        canViewAll: true,
        branchFilter: "all",
        startDate: "",
        endDate: "",
      })!;
      const input = {
        data,
        filteredData,
        scoreSnapshot: snapshot,
        summary: aggregateDashboard(snapshot, {
          scope: "branches",
          start: "",
          end: "",
          branch: "all",
        }),
        genDeductions: seed
          ? [
              {
                id: "general",
                audit_id: data.audits[0]!.id,
                percentage: 5,
                reason_text: "سبب الخصم",
                created_at: "2026-10-01",
              },
            ]
          : [],
        secDeductions: seed
          ? [
              {
                id: "section",
                audit_id: data.audits[0]!.id,
                section_id: data.sections[0]!.id,
                percentage: 2,
                reason_text: "خصم القسم",
                created_at: "2026-10-01",
              },
            ]
          : [],
      };
      const after = buildDashboardWorkbook(XLSX, input);
      const before = beforeWorkbook(XLSX, input);
      for (const sheet of Object.values(before.Sheets)) {
        for (const cell of Object.values(sheet)) {
          if (cell && typeof cell === "object" && typeof cell.v === "string") {
            cell.v = cell.v.replaceAll("البرامج", "الأوديتس");
          }
        }
      }
      const beforeVisits = before.Sheets["الفروع والزيارات"]!;
      const afterVisits = after.Sheets["الفروع والزيارات"]!;
      for (const address of Object.keys(beforeVisits)) {
        if (
          /^H\d+$/.test(address) &&
          beforeVisits[`G${address.slice(1)}`]?.v === "Approved (معتمد)"
        ) {
          beforeVisits[address] = afterVisits[address]!;
        }
      }
      expect(after).toEqual(before);
      const roundTrip = XLSX.read(XLSX.write(after, { type: "buffer", bookType: "xlsx" }), {
        type: "buffer",
        cellStyles: true,
      });
      expect(roundTrip.SheetNames).toEqual(after.SheetNames);
      for (const name of after.SheetNames) {
        expect(
          XLSX.utils.sheet_to_json(roundTrip.Sheets[name]!, { header: 1, defval: "" }),
        ).toEqual(XLSX.utils.sheet_to_json(after.Sheets[name]!, { header: 1, defval: "" }));
      }
    }
  });
});

it.each(["branches", "warehouses"] as const)(
  "exports the current after-discount figure of an approved visit for %s",
  (scope) => {
    const { data, snapshot } = detailFixture(1);
    const approved = data.audits[0]!;
    approved.status = "submitted";
    approved.score = 92.47;
    approved.audit_date = "2026-11-16";
    const section = snapshot.audits[0]!.sections[0]!;
    snapshot.audits = [
      {
        ...snapshot.audits[0]!,
        status: "submitted",
        date: approved.audit_date,
        generalDeductions: [5],
        sections: [
          {
            ...section,
            maximum: 372,
            earned: 350,
            isNa: false,
            isDelivery: false,
            deductions: [],
            deduction: 0,
          },
          { ...section, id: "delivery", maximum: 4, earned: 0, isNa: false, isDelivery: true },
        ],
      },
    ];
    data.audits = [approved];
    const filteredData = buildDashboardDetails({
      data,
      snapshot,
      profile: { id: "user" },
      canViewAll: true,
      branchFilter: "all",
      startDate: "",
      endDate: "",
    })!;
    const input = {
      data,
      filteredData,
      summary: null,
      scoreSnapshot: snapshot,
      genDeductions: [],
      secDeductions: [],
      scope,
    };
    const workbook = buildDashboardWorkbook(XLSX, input);
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const visitSheet = XLSX.read(bytes, { type: "buffer" }).Sheets[
      scope === "branches" ? "الفروع والزيارات" : "المخازن والزيارات"
    ]!;
    expect(visitSheet["H2"]?.v).toBe("FinalPercentage (النسبة)");
    expect(visitSheet["H3"]?.v).toBe("89.09%"); // 350/372 − 5pp; separate delivery excluded.
    expect(() =>
      buildDashboardWorkbook(XLSX, {
        ...input,
        scoreSnapshot: { ...snapshot, audits: [] },
      }),
    ).toThrow("بيانات الأوديتس اتغيّرت");
  },
);

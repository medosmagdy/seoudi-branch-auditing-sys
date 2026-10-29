import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import * as XLSX from "xlsx-js-style";
import { buildDashboardWorkbook } from "./export";
import { buildDashboardWorkbook as beforeWorkbook } from "./__fixtures__/pre-refactor-export";
import { buildDashboardDetails } from "./detail-model";
import { aggregateDashboard } from "./snapshot";
import { detailFixture } from "./__fixtures__/detail-data";

describe("dashboard Excel behavior before and after refactoring", () => {
  it("preserves all cells, styles, worksheet order, dimensions, RTL and deduction output", () => {
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

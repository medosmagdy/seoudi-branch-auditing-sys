import { describe, expect, it } from "vitest";
import { read, utils, write } from "xlsx";
import { buildSlaughterWorkbook, type SlaughterExportReport } from "./slaughter-export";
const report = (id: string, details = false): SlaughterExportReport => ({
  id,
  date: "2026-10-24",
  farm: "مزرعة",
  slaughterhouse: "مجزر",
  animalType: "Bulls",
  number: 10,
  received: 8,
  rejected: 2,
  carcassWeight: 150,
  meatScore: 88,
  status: "مسودة",
  ...(details
    ? {
        details: {
          version: 1 as const,
          score: 0,
          farmWeight: 200,
          receivingWeight: 180,
          fatWeight: 0,
          tripDuration: "2h",
          acceptedException: 0,
          notes: { q: "ملاحظة عربية" },
          nonconformities: { q: "8" },
          checklist: [
            {
              section: "4. Meat quality score",
              item: "q",
              maximum: 4,
              nonconformity: 8,
              degree: 0,
              note: "ملاحظة عربية",
            },
          ],
        },
      }
    : {}),
});
describe("slaughter Excel export", () => {
  it("exports every selected report and preserves row identity, zero and Arabic after XLSX roundtrip", () => {
    const wb = buildSlaughterWorkbook([report("a", true), report("b")], {
      month: "2026-10",
      animalType: "Bulls",
      source: "قاعدة البيانات",
    });
    const reread = read(write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    const rows = utils.sheet_to_json<Record<string, unknown>>(reread.Sheets["Grand Total"]!);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      "meat score": 0,
      "slaughtering evaluation": 0,
      farm: "مزرعة",
      "accepted as exception": 0,
    });
    expect(rows[1]!["meat score"]).toBe(88);
    expect(utils.sheet_to_json(reread.Sheets["Report IDs"]!)).toEqual([
      expect.objectContaining({ "Report ID": "a" }),
      expect.objectContaining({ "Report ID": "b" }),
    ]);
    expect(utils.sheet_to_json(reread.Sheets["Checklist"]!)).toEqual([
      expect.objectContaining({ "Report ID": "a", degree: 0, note: "ملاحظة عربية" }),
    ]);
    expect(utils.sheet_to_json(reread.Sheets["Entered details"]!)).toHaveLength(1);
    const summary = utils.sheet_to_json<{ البيان: string; القيمة: unknown }>(
      reread.Sheets["Summary"]!,
    );
    expect(summary.find((r) => r.البيان === "إجمالي الحيوانات")?.القيمة).toBe(20);
    expect(summary.find((r) => r.البيان === "الشهر")?.القيمة).toBe("2026-10");
  });
  it("uses the supplied filtered rows only and does not fabricate archive checklist data", () => {
    const wb = buildSlaughterWorkbook([report("filtered")], { source: "أرشيف محلي" });
    expect(utils.sheet_to_json(wb.Sheets["Grand Total"]!)).toHaveLength(1);
    expect(wb.SheetNames).not.toContain("Checklist");
    expect(wb.SheetNames).not.toContain("Entered details");
  });
  it("rejects an empty export rather than creating a misleading empty file", () => {
    expect(() => buildSlaughterWorkbook([])).toThrow("لا توجد تقارير");
  });
});

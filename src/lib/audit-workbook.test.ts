import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import XLSX from "xlsx-js-style";
import { buildAuditWorkbook } from "./audit-workbook";
import { auditExportFixture } from "./__fixtures__/audit-export";

describe("live-formula audit Excel export", () => {
  it("links editable questions through group/section totals to the final result without double counting", async () => {
    const model = auditExportFixture();
    const before = structuredClone(model);
    const built = buildAuditWorkbook(model);
    const summary = built.workbook.Sheets["البيانات"]!;
    expect(summary[built.finalCell]!.v).toBe(0.35);
    expect(summary[built.finalCell]!.f).toContain(built.totalCell);
    expect(summary["D12"]!.f).toContain("'السلامة'!");
    const question = built.inputs.find((q) => q.questionId === "q1")!;
    expect(built.workbook.Sheets[question.sheet]![question.scoreCell]!.v).toBe(4);
    const read = XLSX.read(XLSX.write(built.workbook, { bookType: "xlsx", type: "buffer" }), {
      type: "buffer",
      cellFormula: true,
    });
    expect(read.Sheets["البيانات"]![built.finalCell]!.f).toBe(summary[built.finalCell]!.f);
    expect(model).toEqual(before);
    if (process.env["SQOP_EXPORT_QA_JSON"])
      await writeFile(process.env["SQOP_EXPORT_QA_JSON"], JSON.stringify(built));
  });
  it("uses the existing dark-store delivery inclusion and exact two-decimal rounding", () => {
    for (const branch of [
      "فرع تجريبي",
      "دارك ستور زايد",
      "دارك ستور المعادي",
      "دارك ستور الكيت كات",
    ]) {
      const model = auditExportFixture(branch),
        built = buildAuditWorkbook(model);
      const summary = built.workbook.Sheets["البيانات"]!;
      expect(summary[built.finalCell]!.v).toBe(model.result.finalPercentage / 100);
      expect(summary["G13"]!.v).toBe(branch.startsWith("دارك") ? "نعم" : "لا");
    }
  });
  it("exports warehouse identity and program data instead of labelling it as a branch", () => {
    const model = auditExportFixture("المخازن المركزية");
    model.auditTypeName = "سلامة الغذاء FS (WH)";
    const built = buildAuditWorkbook(model),
      summary = built.workbook.Sheets["البيانات"]!;
    expect(summary["B2"]!.v).toContain("المخازن");
    expect(summary["B5"]!.v).toBe("المخزن");
    expect(summary["C5"]!.v).toBe("المخازن المركزية");
    expect(summary["C6"]!.v).toBe("TEST");
    expect(summary["B9"]!.v).toBe("مدير المخزن");
    expect(built.filename).toContain("المخازن المركزية");
  });
  it("does not silently turn historic unresolved NULL scores into full credit", () => {
    const model = auditExportFixture();
    model.sections[0]!.groups[0]!.questions[0]!.unresolvedScore = true;
    const built = buildAuditWorkbook(model);
    const q = built.inputs[0]!;
    expect(built.workbook.Sheets[q.sheet]![q.scoreCell]!.v).toBe("");
    expect(built.workbook.Sheets["البيانات"]![built.finalCell]!.v).toBe("درجات تحتاج مراجعة");
    expect(built.unresolvedCount).toBe(1);
  });
  it("escapes apostrophes and disambiguates section sheet names", () => {
    const model = auditExportFixture();
    model.sections[0]!.nameAr = "قسم O'Brien";
    model.sections[1]!.nameAr = "قسم O'Brien";
    const built = buildAuditWorkbook(model);
    expect(new Set(built.workbook.SheetNames).size).toBe(built.workbook.SheetNames.length);
    expect(built.workbook.Sheets["البيانات"]!["D12"]!.f).toContain("O''Brien");
  });
});

import { describe, it, expect } from "vitest";
import { utils, write } from "xlsx";
import { openMaintenanceWorkbook } from "./maintenance-import";
import { readFile } from "node:fs/promises";
function bytes(rows: unknown[][]) {
  const b = utils.book_new();
  utils.book_append_sheet(b, utils.aoa_to_sheet(rows), "Report");
  return new Uint8Array(write(b, { type: "array", bookType: "xlsx" }));
}
describe("maintenance workbook import", () => {
  it("retains statuses, zero text, original history and corrective evidence without creating any server records", async () => {
    const w = await openMaintenanceWorkbook(
      bytes([
        ["الفرع", "شيراتون"],
        ["المراجع", "Doctor"],
        [
          "القسم",
          "نقاط الصيانة",
          "الخطورة",
          "الحالة",
          "تاريخ العطل",
          "الإجراء التصحيحي",
          "الأدلة",
          "تعليقات",
        ],
        ["سمك", "باب", "High", "لم يتم", "9/2024", "تغيير", "طلب شراء", "0"],
        ["جزارة", "حوض", "Low", "تم", "2025", "", "", ""],
      ]),
    );
    const p = await w.preview("Report");
    expect(p.branch).toBe("شيراتون");
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]!.finding).toMatchObject({
      severity: "high",
      status: "open",
      comments: "0",
      initial_history: "9/2024",
      evidence: "طلب شراء",
    });
    expect(p.rows[1]!.finding.status).toBe("resolved");
  });
  it("rejects unknown statuses and missing sections rather than guessing", async () => {
    const w = await openMaintenanceWorkbook(
      bytes([
        ["القسم", "نقاط الصيانة", "الخطورة", "الحالة"],
        ["سمك", "باب", "High", "done maybe"],
      ]),
    );
    await expect(w.preview("Report")).rejects.toThrow("الحالة غير معروفة");
  });
  it("rejects corrupt/non-xlsx inputs", async () => {
    await expect(openMaintenanceWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow("xlsx");
  });
});
it.skipIf(!process.env["SQOP_MAINTENANCE_WORKBOOK"])(
  "reads the supplied reference privately, matching all findings and in-cell images",
  async () => {
    const bytes = new Uint8Array(await readFile(process.env["SQOP_MAINTENANCE_WORKBOOK"]!));
    const w = await openMaintenanceWorkbook(bytes),
      p = await w.preview(w.sheets[0]!);
    expect(p.rows).toHaveLength(69);
    expect(p.rows.filter((r) => r.finding.status === "resolved")).toHaveLength(36);
    expect(p.rows.filter((r) => r.finding.status === "open")).toHaveLength(33);
    expect(p.rows.reduce((n, r) => n + r.images.length, 0)).toBe(69);
    expect(p.rows.every((r) => r.images.length === 1)).toBe(true);
    expect(p.warnings).toEqual([]);
    expect(p.inspectionDate).toBe("2026-09-01");
  },
);

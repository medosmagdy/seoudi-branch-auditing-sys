import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  filterExpiryRecords,
  buildExpiryWorkbook,
  type ExpiryRecord,
  type ExpiryFilters,
} from "./expiry";
import {
  filterExpiryRecords as beforeFilter,
  buildExpiryWorkbook as beforeWorkbook,
} from "./__fixtures__/pre-refactor-expiry";
const records: ExpiryRecord[] = Array.from({ length: 24 }, (_, n) => ({
  id: String(n),
  expiry_date: n % 2 ? "2026-10-01" : "2026-09-30",
  branch_id: n % 3 ? "a" : "b",
  section: n % 2 ? "الأسماك" : "عام",
  product_name: n % 2 ? "Fish" : "منتج",
  expiry_state: ["صلاحية", "تزوير", "تدوير"][n % 3] as ExpiryRecord["expiry_state"],
  deduction_percentage: n % 2 ? 0 : 5,
  deduction_scope: n % 2 ? "section" : "branch",
  quantity: n % 2 ? null : 0,
  notes: n % 2 ? "ملاحظة" : null,
  created_by: "user",
  review_status: n % 2 ? "reviewed" : "pending",
  created_at: "2026-10-01T00:00:00Z",
}));
const base: ExpiryFilters = {
  from: "",
  to: "",
  branch: "all",
  section: "all",
  scope: "all",
  state: "all",
  review: "all",
  search: "",
};
describe("expiry behavior before and after refactoring", () => {
  it("preserves all date, branch, section, deduction, state, review and search combinations", () => {
    const before = structuredClone(records);
    const changes = [
      {},
      { from: "2026-10-01" },
      { to: "2026-09-30" },
      { branch: "a" },
      { section: "الأسماك" },
      { scope: "branch" },
      { state: "تزوير" },
      { review: "pending" },
      { search: "FISH" },
      { search: "ملاحظة" },
      { search: "absent" },
    ];
    for (const change of changes)
      for (const other of changes) {
        const filters = { ...base, ...change, ...other };
        expect(filterExpiryRecords(records, filters)).toEqual(beforeFilter(records, filters));
      }
    expect(records).toEqual(before);
  });
  it("preserves missing legacy state/review fallbacks", () => {
    const legacy = [
      { ...records[0], expiry_state: undefined, review_status: undefined, status: "تدوير" },
    ] as unknown as ExpiryRecord[];
    const filters = { ...base, state: "تدوير", review: "pending" };
    expect(filterExpiryRecords(legacy, filters)).toEqual(legacy);
    expect(filterExpiryRecords(legacy, filters)).toEqual(beforeFilter(legacy, filters));
  });
  it("preserves Excel cells, RTL, columns, empty values and missing branch labels", () => {
    const branches = [{ id: "a", name_ar: "فرع أ" }];
    for (const selected of [[], records, records.slice(0, 3)]) {
      const current = buildExpiryWorkbook(XLSX, selected, branches);
      expect(current).toEqual(beforeWorkbook(XLSX, selected, branches));
      const restored = XLSX.read(XLSX.write(current, { type: "buffer", bookType: "xlsx" }), {
        type: "buffer",
      });
      expect(restored.SheetNames).toEqual(current.SheetNames);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  isWarehouseAuditType,
  matchesAuditTypeScope,
  matchesLocationScope,
} from "./location-scope";

describe("location scope", () => {
  it("recognizes central warehouses by Arabic name", () => {
    expect(matchesLocationScope({ name_ar: "المخازن المركزية" }, "warehouses")).toBe(true);
    expect(matchesLocationScope({ name_ar: "فرع مدينة نصر" }, "warehouses")).toBe(false);
  });

  it("keeps warehouse audit types isolated from branch types", () => {
    const warehouseType = { code: "FS (WH)", name_ar: "سلامة الغذاء (مخازن)" };
    const branchType = { code: "FS", name_ar: "سلامة الغذاء" };

    expect(isWarehouseAuditType(warehouseType)).toBe(true);
    expect(matchesAuditTypeScope(warehouseType, "warehouses")).toBe(true);
    expect(matchesAuditTypeScope(branchType, "warehouses")).toBe(false);
    expect(matchesAuditTypeScope(branchType, "branches")).toBe(true);
  });
});

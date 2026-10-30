import { describe, it, expect } from "vitest";
import { APP_SECTIONS, canSeeSection, sectionForRoute } from "./app-sections";
describe("section visibility and route coverage", () => {
  it("preserves existing defaults and isolates branch and warehouse dashboards", () => {
    expect(sectionForRoute("/dashboard", "warehouses")).toBe("warehouses");
    expect(sectionForRoute("/dashboard", "branches")).toBe("branches");
    for (const path of ["/audits", "/audits/new", "/audits/abc/report", "/audits/abc/summary"])
      expect(sectionForRoute(path)).toBe("audits");
    expect(sectionForRoute("/maintenance")).toBe("maintenance");
    expect(canSeeSection("manager", "maintenance")).toBe(false);
    expect(canSeeSection("auditor", "maintenance", { maintenance: true })).toBe(true);
    expect(sectionForRoute("/expiry")).toBe("expiry");
    expect(sectionForRoute("/admin")).toBeNull();
    expect(sectionForRoute("/slaughtering")).toBe("slaughtering");
    expect(sectionForRoute("/audits-unrelated")).toBeNull();
    expect(canSeeSection("manager", "slaughtering")).toBe(false);
    expect(canSeeSection("auditor", "audits")).toBe(true);
    expect(canSeeSection("manager", "branches")).toBe(true);
  });
  it("supports explicit grants and hiding while preserving role-only dashboard access", () => {
    expect(canSeeSection("auditor", "slaughtering", { slaughtering: true })).toBe(true);
    expect(canSeeSection("manager", "audits", { audits: false })).toBe(false);
    expect(canSeeSection("manager", "warehouses", { branches: false })).toBe(true);
    expect(canSeeSection("auditor", "branches", { branches: true })).toBe(false);
    for (const s of APP_SECTIONS)
      expect(canSeeSection("admin", s.id, { [s.id]: false })).toBe(true);
  });
});

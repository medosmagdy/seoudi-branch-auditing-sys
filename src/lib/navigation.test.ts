import { describe, expect, it } from "vitest";
import { navigationAccess } from "./navigation";
describe("navigation reflects the existing role restrictions", () => {
  it("keeps all active roles able to start/list audits and access expiry, admin-only areas restricted", () => {
    for (const role of ["admin", "manager", "auditor"] as const) {
      const profile = { role, active: true };
      for (const page of ["/audits", "/audits/new", "/expiry"])
        expect(navigationAccess(profile, page).allowed).toBe(true);
      for (const page of ["/admin", "/slaughtering"])
        expect(navigationAccess(profile, page).allowed).toBe(role === "admin");
      expect(navigationAccess(profile, "/dashboard").allowed).toBe(role !== "auditor");
      expect(navigationAccess({ ...profile, active: false }, "/audits").allowed).toBe(false);
    }
    expect(navigationAccess(null, "/admin").allowed).toBe(false);
  });
});

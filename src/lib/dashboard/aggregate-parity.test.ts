import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { aggregateDashboard } from "./snapshot";
import { aggregateDashboard as beforeAggregate } from "./__fixtures__/pre-refactor-snapshot";
import { detailFixture } from "./__fixtures__/detail-data";

describe("indexed dashboard aggregation versus original behavior", () => {
  it("preserves exact unrounded results, ranking ties, missing programs, weights and inactive branches", () => {
    for (let seed = 0; seed < 8; seed++) {
      const { snapshot } = detailFixture(seed);
      snapshot.locations[0]!.active = false;
      snapshot.locations.push({
        id: "inactive-empty",
        name_ar: "غير نشط",
        code: null,
        active: false,
      });
      snapshot.audits.push({
        ...snapshot.audits[0]!,
        id: "unknown",
        type: { id: "unknown", code: "OTHER", name_ar: null, name_en: null },
      });
      for (const program of ["all", "FS", "GHP", "FSMS"] as const)
        for (const branch of ["all", "a", "empty"])
          for (const range of [
            { start: "", end: "" },
            { start: "2026-10-01", end: "2026-10-31" },
            { start: "2026-09-01", end: "2026-09-30" },
          ]) {
            const filters = { scope: "branches" as const, branch, program, ...range };
            expect(aggregateDashboard(snapshot, filters)).toEqual(
              beforeAggregate(snapshot, filters),
            );
          }
    }
  });
  it("preserves results on a large multi-year dataset without mutating input", () => {
    const { snapshot } = detailFixture();
    const originals = snapshot.audits;
    snapshot.locations = Array.from({ length: 80 }, (_, n) => ({
      id: `branch-${n}`,
      name_ar: `فرع ${n}`,
      code: null,
      active: true,
    }));
    snapshot.audits = Array.from({ length: 2400 }, (_, n) => ({
      ...originals[n % originals.length]!,
      id: `audit-${n}`,
      branchId: `branch-${n % 80}`,
      date: `${2025 + (n % 2)}-${String(1 + (n % 12)).padStart(2, "0")}-15`,
    }));
    const untouched = structuredClone(snapshot);
    const filters = {
      scope: "branches" as const,
      branch: "all",
      program: "all" as const,
      start: "2025-01-01",
      end: "2026-12-31",
    };
    const startBefore = performance.now();
    const expected = beforeAggregate(snapshot, filters);
    const beforeMs = performance.now() - startBefore;
    const startAfter = performance.now();
    const actual = aggregateDashboard(snapshot, filters);
    const afterMs = performance.now() - startAfter;
    expect(actual).toEqual(expected);
    expect(snapshot).toEqual(untouched);
    console.info(
      `LOCAL CPU ONLY: 2,400 visits / 80 branches / 24 months: before=${beforeMs.toFixed(1)}ms after=${afterMs.toFixed(1)}ms. Not network or browser timing.`,
    );
  });
});

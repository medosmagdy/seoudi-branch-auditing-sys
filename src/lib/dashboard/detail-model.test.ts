import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildDashboardDetails, buildBranchProgramsTree } from "./detail-model";
import {
  buildDashboardDetails as beforeDetails,
  buildBranchProgramsTree as beforeTree,
} from "./__fixtures__/pre-refactor-details";
import { detailFixture } from "./__fixtures__/detail-data";

describe("dashboard behavior before and after refactoring", () => {
  it("preserves every detail, finding, deduction, branch and drilldown across 96 filter/role/data combinations", () => {
    for (let seed = 0; seed < 8; seed++) {
      const { data, snapshot } = detailFixture(seed);
      const untouched = structuredClone({ data, snapshot });
      for (const canViewAll of [true, false])
        for (const branchFilter of ["all", "a", "empty"])
          for (const startDate of ["", "2026-10-01"]) {
            const context = {
              data,
              snapshot,
              profile: { id: "user" },
              canViewAll,
              branchFilter,
              startDate,
              endDate: "2026-10-31",
            };
            const before = beforeDetails(context)!;
            const after = buildDashboardDetails(context)!;
            expect(after).toEqual(before);
            for (const branch of after.branchesSummary) {
              expect(buildBranchProgramsTree(branch, after, data, snapshot)).toEqual(
                beforeTree(branch, before, data, snapshot),
              );
            }
          }
      expect({ data, snapshot }).toEqual(untouched);
    }
  });
  it("preserves loading and empty states", () => {
    const { data, snapshot } = detailFixture();
    const context = {
      data,
      snapshot,
      profile: { id: "user" },
      canViewAll: true,
      branchFilter: "all",
      startDate: "",
      endDate: "",
    };
    expect(buildDashboardDetails({ ...context, data: undefined })).toBeNull();
    expect(buildDashboardDetails({ ...context, snapshot: undefined })).toBeNull();
    expect(buildDashboardDetails({ ...context, profile: null })).toBeNull();
    expect(buildBranchProgramsTree(null, null, undefined, undefined)).toEqual({
      foodSafety: [],
      ghp: [],
      fsms: [],
    });
    expect(
      buildDashboardDetails({
        ...context,
        data: { ...data, audits: [], answers: [] },
        snapshot: { ...snapshot, audits: [] },
      }),
    ).toEqual(
      beforeDetails({
        ...context,
        data: { ...data, audits: [], answers: [] },
        snapshot: { ...snapshot, audits: [] },
      }),
    );
  });
});

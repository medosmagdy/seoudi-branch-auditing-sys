import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ range: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const query = {
          eq: (...args: unknown[]) => {
            mocks.eq(...args);
            return query;
          },
          order: (...args: unknown[]) => {
            mocks.order(...args);
            return query;
          },
          range: mocks.range,
        };
        return query;
      },
    }),
  },
}));
import { loadAuditAnswers } from "./audit-answers";

describe("program-scoped answer loading", () => {
  beforeEach(() => vi.resetAllMocks());

  it("filters by audit and program, orders pages and loads beyond one page", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ question_id: `q${i}` }));
    mocks.range
      .mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValueOnce({ data: [{ question_id: "last" }], error: null });
    expect(await loadAuditAnswers("audit-fs", "fs")).toHaveLength(501);
    expect(mocks.eq).toHaveBeenCalledWith("audit_id", "audit-fs");
    expect(mocks.eq).toHaveBeenCalledWith("questions.audit_type_id", "fs");
    expect(mocks.order).toHaveBeenCalledWith("id");
    expect(mocks.range.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it("rejects a later-page failure instead of returning an incomplete score", async () => {
    mocks.range
      .mockResolvedValueOnce({ data: Array(500).fill({ question_id: "q" }), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("network error") });
    await expect(loadAuditAnswers("a", "fs")).rejects.toThrow("network error");
  });
});

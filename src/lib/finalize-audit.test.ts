import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportModel } from "./report-data";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  upsert: vi.fn(),
  statusUpsert: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/report-data", () => ({ loadReportModel: mocks.load }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "audit_answers") return { upsert: mocks.upsert };
      if (table === "audit_section_status") return { upsert: mocks.statusUpsert };
      return {
        update: (payload: unknown) => {
          mocks.update(payload);
          return { eq: () => ({ select: () => ({ single: mocks.single }) }) };
        },
      };
    },
  },
}));

import { defaultAnswersForReport, finalizeAudit } from "./finalize-audit";

function report(finalPercentage = 90) {
  return {
    auditId: "audit-fs",
    result: { finalPercentage, overallPercentage: 96 },
    sections: [
      {
        id: "section-fs",
        excluded: false,
        groups: [
          {
            questions: [
              { id: "untouched-fs", maxScore: 4 },
              { id: "deducted-fs", maxScore: 2, score: 0 },
              { id: "na-fs", maxScore: 4, isNa: true },
            ],
          },
        ],
      },
      {
        id: "excluded-section",
        excluded: true,
        groups: [{ questions: [{ id: "excluded", maxScore: 4 }] }],
      },
    ],
  } as unknown as ReportModel;
}

describe("audit submission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.statusUpsert.mockResolvedValue({ error: null });
    mocks.single.mockResolvedValue({ data: { id: "audit-fs" }, error: null });
  });

  it("defaults only to the current report's questions and excludes N/A sections", () => {
    const defaults = defaultAnswersForReport(report());
    expect(defaults.map((row) => row.question_id)).toEqual([
      "untouched-fs",
      "deducted-fs",
      "na-fs",
    ]);
    expect(defaults.map((row) => row.score)).toEqual([4, 2, null]);
    expect(defaults.every((row) => row.audit_id === "audit-fs")).toBe(true);
  });

  it("preserves saved deductions/N/A and saves freshly recalculated scores", async () => {
    mocks.load.mockResolvedValueOnce(report(90)).mockResolvedValueOnce(report(82));
    await expect(finalizeAudit("audit-fs")).resolves.toMatchObject({ finalPercentage: 82 });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: "audit_id,question_id",
      ignoreDuplicates: true,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "submitted",
        score: 82,
        overall_score: 96,
      }),
    );
    expect(mocks.load).toHaveBeenNthCalledWith(1, "audit-fs", { includePhotos: false });
  });

  it("does not submit if saving default answers fails", async () => {
    mocks.load.mockResolvedValue(report());
    mocks.upsert.mockResolvedValue({ error: new Error("write denied") });
    await expect(finalizeAudit("audit-fs")).rejects.toThrow("write denied");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not submit if the fresh score cannot be loaded", async () => {
    mocks.load.mockResolvedValueOnce(report()).mockRejectedValueOnce(new Error("read denied"));
    await expect(finalizeAudit("audit-fs")).rejects.toThrow("read denied");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not report success when the audit update returns no writable row", async () => {
    mocks.load.mockResolvedValue(report());
    mocks.single.mockResolvedValue({ data: null, error: new Error("no row") });
    await expect(finalizeAudit("audit-fs")).rejects.toThrow("no row");
  });
});

describe("unresolved score protection", () => {
  it("blocks old NULL answers before any default write", async () => {
    vi.resetAllMocks();
    const model = report();
    model.sections[0]!.groups[0]!.questions[0]!.unresolvedScore = true;
    mocks.load.mockResolvedValue(model);
    await expect(finalizeAudit("audit-fs")).rejects.toThrow("لا يمكن اعتماد");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks NULL appearing in the final reread", async () => {
    vi.resetAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.statusUpsert.mockResolvedValue({ error: null });
    const fresh = report();
    fresh.sections[0]!.groups[0]!.questions[0]!.unresolvedScore = true;
    mocks.load.mockResolvedValueOnce(report()).mockResolvedValueOnce(fresh);
    await expect(finalizeAudit("audit-fs")).rejects.toThrow("لا يمكن اعتماد");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it("persists inherited N/A questions and section exclusions before finalizing", async () => {
  mocks.load.mockResolvedValue(report());
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.statusUpsert.mockResolvedValue({ error: null });
  mocks.single.mockResolvedValue({ data: { id: "audit-fs" }, error: null });
  await finalizeAudit("audit-fs");
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ question_id: "na-fs", score: null, is_na: true }),
    ]),
    expect.objectContaining({ ignoreDuplicates: true }),
  );
  expect(mocks.statusUpsert).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ section_id: "excluded-section", is_na: true }),
    ]),
    expect.objectContaining({ ignoreDuplicates: true }),
  );
});

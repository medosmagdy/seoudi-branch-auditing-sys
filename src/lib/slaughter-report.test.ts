import { describe, expect, it } from "vitest";
import {
  rejectionSummary,
  slaughterPercent,
  validateSlaughterDraft,
  type SlaughterDraft,
  type SlaughterDetailsV1,
} from "./slaughter-report";
const draft = (): SlaughterDraft & { details: SlaughterDetailsV1 } => ({
  date: "2026-10-24",
  farm: "farm",
  slaughterhouse: "house",
  animalType: "Bulls",
  number: 10,
  received: 8,
  carcassWeight: 100,
  meatScore: 80,
  acceptedException: 0,
  rejectionReason: "",
  photos: [],
  details: {
    version: 1,
    score: 80,
    farmWeight: 200,
    receivingWeight: 180,
    fatWeight: 0,
    tripDuration: "2h",
    acceptedException: 0,
    notes: {},
    nonconformities: {},
    checklist: [],
  },
});
describe("slaughter report validation and display", () => {
  it("allows zero received and zero scores", () => {
    const d = draft();
    d.received = 0;
    d.meatScore = 0;
    expect(validateSlaughterDraft(d)).toBeNull();
  });
  it("rejects inconsistent counts, non-finite weights, and out-of-range exception counts", () => {
    const a = draft();
    a.received = 11;
    expect(validateSlaughterDraft(a)).not.toBeNull();
    const b = draft();
    b.carcassWeight = NaN;
    expect(validateSlaughterDraft(b)).not.toBeNull();
    const c = draft();
    c.acceptedException = 9;
    expect(validateSlaughterDraft(c)).not.toBeNull();
    const d = draft();
    d.number = 2.5;
    expect(validateSlaughterDraft(d)).not.toBeNull();
  });
  it("rejects negative or excessive item nonconformities", () => {
    const d = draft();
    d.details.nonconformities = { q: "9" };
    expect(validateSlaughterDraft(d)).not.toBeNull();
    d.details.nonconformities = { q: "-1" };
    expect(validateSlaughterDraft(d)).not.toBeNull();
  });
  it("formats legacy fractions and new percentages consistently, including exactly 1%", () => {
    expect(slaughterPercent(0.88)).toBe("88.0%");
    expect(slaughterPercent(88)).toBe("88.0%");
    expect(slaughterPercent(1, "percentage")).toBe("1.0%");
    expect(slaughterPercent(0, "percentage")).toBe("0.0%");
    expect(slaughterPercent(undefined)).toBe("—");
  });
  it("counts matching reports once, without mixing archives or animal counts", () => {
    expect(
      rejectionSummary(
        [
          { rejectionReasons: "Live", rejected: 5 },
          { rejectionReasons: "Live / TB", rejected: 3 },
        ],
        ["Live", "TB"],
      ),
    ).toEqual({ Live: 2, TB: 1 });
  });
});

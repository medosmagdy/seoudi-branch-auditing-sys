import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { SlaughterForm } from "@/components/slaughter/SlaughterForm";
import { SlaughterMetrics } from "@/components/slaughter/SlaughterDailyReport";
import { emptySlaughterInput, evaluateSlaughter } from "./slaughter-evaluation";
import { aggregateSlaughter, slaughterAnimalType, type SlaughterReport } from "./slaughter-model";
describe("slaughter input and output views", () => {
  it("presents separate breed, weights and exception fields and offers all daily report sections", () => {
    const html = renderToStaticMarkup(
      createElement(SlaughterForm, {
        date: "2026-09-13",
        onDate: () => {},
        farms: [],
        houses: [],
        onSave: async () => true,
        notify: () => {},
      }),
    );
    expect(html).toContain("السلالة");
    expect(html).toContain('aria-label="المزرعة"');
    expect(html).toContain('aria-label="المجزر"');
    expect(html.match(/إضافة جديد/g) ?? []).toHaveLength(2);
    expect(html).not.toContain('<datalist id="slaughter-farms');
    expect(html).toContain("وزن المرفوض");
    expect(html).toContain("المقبول استثنائيًا من المستلم");
    expect(html).toContain("السيارات والصور");
    expect(html).toContain("الحالات والملاحظات");
    expect(html).toContain("غير مكتمل");
  });
  it("renders zero scores explicitly and unavailable ratios as a dash", () => {
    const i = emptySlaughterInput();
    i.number = 2;
    i.received = 0;
    i.directDegrees = { Facilities: "0", Tools: "0", Employee: "0" };
    const html = renderToStaticMarkup(createElement(SlaughterMetrics, { input: i }));
    expect(html).toContain("0 / 5");
    expect(html).toContain("—");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("restores an incomplete saved v2 draft without defaulting its zero or blank grades", () => {
    const i = emptySlaughterInput();
    i.number = 5;
    i.received = 5;
    i.directDegrees = { Tools: "0" };
    const r: SlaughterReport = {
      id: "draft",
      date: "2026-09-13",
      farm: "Saved farm",
      slaughterhouse: "Saved house",
      animalType: "Sheep",
      number: 5,
      received: 5,
      rejected: 0,
      carcassWeight: null,
      meatScore: null,
      status: "مسودة",
      details: { version: 2, score: null, input: i, evaluation: evaluateSlaughter(i) },
    };
    const html = renderToStaticMarkup(
      createElement(SlaughterForm, {
        date: r.date,
        initial: r,
        onDate: () => {},
        farms: [],
        houses: [],
        onSave: async () => true,
        notify: () => {},
      }),
    );
    expect(html).toContain('value="Saved farm"');
    expect(html).toContain('value="Saved house"');
    expect(html).toContain("غير مكتمل");
  });
  it("groups harmless case/space variants and recognizes archive species spellings without changing source rows", () => {
    expect(slaughterAnimalType("Baffalo")).toBe("Buffalo");
    expect(slaughterAnimalType("Goat")).toBe("Goats");
    const base = {
      id: "a",
      date: "2026-09-13",
      farm: "AL Komy",
      slaughterhouse: "",
      animalType: "bulls",
      number: 2,
      received: 2,
      rejected: 0,
      carcassWeight: 5,
      meatScore: 10,
      status: "مكتمل",
      slaughteringEvaluation: 0.9,
    };
    expect(aggregateSlaughter([base, { ...base, id: "b", farm: "al  komy" }], "farm")).toHaveLength(
      1,
    );
    expect(
      aggregateSlaughter([base, { ...base, id: "b", animalType: "Bulls" }], "animalType"),
    ).toHaveLength(1);
    expect(base.animalType).toBe("bulls");
  });
});

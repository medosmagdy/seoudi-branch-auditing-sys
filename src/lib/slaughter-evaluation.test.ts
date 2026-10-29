import { describe, expect, it } from "vitest";
import {
  emptySlaughterInput,
  evaluateSlaughter,
  pieces,
  seasonForHijri,
  slaughterWarnings,
  validateSlaughterInput,
  type SlaughterInput,
} from "./slaughter-evaluation";
import {
  buildDailySlaughterWorkbook,
  buildSlaughterWorkbook,
  GRAND_HEADERS,
} from "./slaughter-export";
import {
  aggregateSlaughter,
  aggregateRejectionCases,
  reportFromSlaughterRow,
  slaughterView,
  type SlaughterReport,
} from "./slaughter-model";
import { read, utils, write } from "xlsx";
import { attachSlaughterImages } from "./slaughter-images";
import JSZip from "jszip";
// Independent reference: uploaded daily workbook 13-9-2026, Evaluation + Checklist.
export function referenceInput(): SlaughterInput {
  return {
    ...emptySlaughterInput(),
    number: 68,
    received: 66,
    farmWeight: 28943,
    receivingWeight: 28943,
    carcassWeight: 17540,
    fatWeight: 410,
    rejectedWeight: 0,
    condemnationWeight: 0,
    breed: "Native breed",
    directDegrees: {
      "General health condition": "1",
      "Lymph nodes": "1",
      Facilities: "0",
      Tools: "0",
      Employee: "0",
      "Cleaning and sanitation": "1.5",
    },
    nonconformities: {
      Bruises: "36",
      Rumen: "1",
      "Examination of carcass L.N.": "1",
      Lung: "3",
      Liver: "4",
      Kidney: "6",
      Heart: "1",
      Condemnation: "16",
    },
    importantNotes: {
      rejection: "2 carcasses",
      trimming: "Injection sites in 10 carcasses",
      condemnation: "12 kidneys",
    },
    notes: { Kidney: "12 pieces = 6 pairs" },
    trucks: [{ number: "1363", temperature: 18 }],
    cases: [
      {
        kind: "condemnation",
        item: "Kidneys",
        quantity: 6,
        unit: "pair",
        affectedAnimals: 6,
        weight: null,
        reason: "hydronephrosis",
        category: "other",
      },
    ],
  };
}
function report(input = referenceInput()): SlaughterReport {
  const evaluation = evaluateSlaughter(input);
  return {
    id: "ref",
    date: "2026-09-13",
    farm: "Family",
    slaughterhouse: "Al Salam",
    animalType: "Bulls",
    number: input.number,
    received: input.received,
    rejected: input.number - input.received,
    carcassWeight: input.carcassWeight,
    meatScore: evaluation.metrics.meatQuality,
    status: "مسودة",
    details: { version: 2, score: evaluation.score, input, evaluation },
  };
}
describe("daily slaughter calculation against the supplied workbook", () => {
  it("reproduces 89.030303% and every section subtotal, preserving direct zero and 1.5", () => {
    const r = evaluateSlaughter(referenceInput());
    expect(r.sectionScores.map((s) => s.degree)).toEqual([25, 0, 45.53030303030303, 10, 8.5]);
    expect(r.score).toBeCloseTo(89.03030303030303, 10);
    expect(r.metrics.examination).toBeCloseTo(0.9553030303030303, 10);
    expect(r.metrics.dressing).toBeCloseTo(0.606018726462357, 10);
  });
  it("uses the daily workbook denominators for weight and exception rates", () => {
    const i = referenceInput();
    i.acceptedException = 8;
    const m = evaluateSlaughter(i).metrics;
    expect(m.averageFarmWeight).toBeCloseTo(28943 / 68);
    expect(m.averageReceivingWeight).toBeCloseTo(28943 / 68);
    expect(m.averageCarcassWeight).toBeCloseTo(17540 / 66);
    expect(m.exceptionRate).toBeCloseTo(8 / 66);
  });
  it("allows exceptional acceptance with zero rejected and bounds it by received", () => {
    const i = referenceInput();
    i.received = 68;
    i.acceptedException = 8;
    expect(validateSlaughterInput(i)).toBeNull();
    i.acceptedException = 69;
    expect(validateSlaughterInput(i)).not.toBeNull();
  });
  it("leaves missing direct grades unavailable rather than full credit or zero", () => {
    const i = referenceInput();
    delete i.directDegrees["Tools"];
    expect(evaluateSlaughter(i).score).toBeNull();
    expect(evaluateSlaughter(i).missing).toContain("Tools");
  });
  it("does not invent a score or divide by zero when no animals are received", () => {
    const i = emptySlaughterInput();
    i.number = 2;
    const r = evaluateSlaughter(i);
    expect(r.score).toBeNull();
    expect(r.metrics.exceptionRate).toBeNull();
    expect(r.metrics.averageCarcassWeight).toBeNull();
  });
  it("retains signed transport loss and warns when weights increase", () => {
    const i = referenceInput();
    i.receivingWeight = 30000;
    expect(evaluateSlaughter(i).metrics.transportationLoss).toBe(-1057);
    expect(slaughterWarnings(i).some((s) => s.includes("بالسالب"))).toBe(true);
  });
  it("converts pairs to pieces without changing the separate animal count", () => {
    expect(pieces(6, "pair")).toBe(12);
    expect(pieces(12, "piece")).toBe(12);
    expect(pieces(6, "animal")).toBeNull();
    const r = referenceInput();
    r.cases[0]!.quantity = 12;
    r.cases[0]!.unit = "piece";
    expect(evaluateSlaughter(r).score).toBe(evaluateSlaughter(referenceInput()).score);
  });
  it("rejects invalid count/degree entries without silently clamping them", () => {
    const i = referenceInput();
    i.directDegrees["Tools"] = "3";
    expect(validateSlaughterInput(i)).not.toBeNull();
    i.directDegrees["Tools"] = "0";
    i.nonconformities["Liver"] = "67";
    expect(validateSlaughterInput(i)).not.toBeNull();
  });
  it("follows the reference season boundaries", () => {
    expect(seasonForHijri("01/09/1448")).toBe("Ramadan");
    expect(seasonForHijri("09/12/1448")).toBe("Adha Season");
    expect(seasonForHijri("10/12/1448")).toBe("Normal");
  });
});
describe("daily and Grand Total export contract", () => {
  it("preserves the exact 38 reference columns and separates meat quality from overall score", () => {
    const wb = buildSlaughterWorkbook([report()]);
    const rows = utils.sheet_to_json<unknown[]>(wb.Sheets["Grand Total"]!, { header: 1 });
    expect(rows[0]).toEqual(GRAND_HEADERS);
    expect(rows[0]).toHaveLength(38);
    expect(wb.Sheets["Grand Total"]!["X2"].v).toBe(10);
    expect(wb.Sheets["Grand Total"]!["AC2"].v).toBeCloseTo(0.8903030303, 9);
    expect(wb.Sheets["Grand Total"]!["P2"].f).toContain("/G2");
    expect(wb.Sheets["Grand Total"]!["AK2"].v).toBe("");
    expect(wb.Sheets["Grand Total"]!["AK2"].f).toBeUndefined();
  });
  it("reproduces the original daily Evaluation and Checklist result cells after XLSX roundtrip", () => {
    const wb = buildDailySlaughterWorkbook(report());
    const reread = read(write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    const e = reread.Sheets["Evaluation"]!,
      c = reread.Sheets["Checklist"]!;
    expect(e["D8"].v).toBe(46278);
    expect(e["D13"].v).toBe(66);
    expect(c["D20"].v).toBe(0);
    expect(c["D54"].v).toBe(1.5);
    expect(c["D59"].v).toBeCloseTo(0.8903030303, 9);
    expect(e["G33"].v).toBeCloseTo(0.9553030303, 9);
    expect(e["G35"].v).toBeCloseTo(0.60601872646, 9);
    expect(e["I15"].f).toContain("/D12");
    expect(e["I14"].f).toContain("/D13");
  });
  it("keeps unavailable score cells blank even after Excel recalculation", () => {
    const i = referenceInput();
    delete i.directDegrees["Tools"];
    const wb = buildDailySlaughterWorkbook(report(i));
    expect(wb.Sheets["Checklist"]!["D18"].v).toBe("");
    expect(wb.Sheets["Checklist"]!["D59"].v).toBe("");
    expect(wb.Sheets["Checklist"]!["D59"].f).toContain("COUNT");
  });
  it("embeds photographs with valid relationships instead of expiring signed hyperlinks", async () => {
    const wb = buildDailySlaughterWorkbook(report());
    const bytes = await attachSlaughterImages(wb, [
      {
        bytes: Uint8Array.from(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "base64",
          ),
        ),
        extension: "png",
        width: 1,
        height: 1,
      },
    ]);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("xl/media/slaughter-1.png")).not.toBeNull();
    expect(await zip.file("xl/worksheets/sheet3.xml")!.async("string")).toContain(
      "rIdSlaughterPictures",
    );
    expect(
      await zip.file("xl/drawings/_rels/slaughterPictures.xml.rels")!.async("string"),
    ).toContain("../media/slaughter-1.png");
    expect(read(bytes, { type: "array" }).Sheets["Checklist"]!["D59"].v).toBeCloseTo(
      0.8903030303,
      9,
    );
  });
  it("does not re-score legacy archive rows or discard available legacy fields", () => {
    const old = {
      ...report(),
      details: undefined,
      slaughteringEvaluation: 0.72,
      meatScore: 9,
      am: 20,
      pm: 40,
      averageTotalWeight: 123,
      kidneysFat: 5,
    };
    const view = slaughterView(old);
    expect(view.score).toBe(72);
    const wb = buildSlaughterWorkbook([old]);
    expect(wb.Sheets["Grand Total"]!["P2"].v).toBe(123);
    expect(wb.Sheets["Grand Total"]!["P2"].f).toBeUndefined();
    expect(wb.Sheets["Grand Total"]!["X2"].v).toBe(9);
  });
  it("roundtrips a v2 snapshot with explicit nulls without falling back to a stale legacy score", () => {
    const i = referenceInput();
    delete i.directDegrees["Tools"];
    const r = report(i);
    const row = reportFromSlaughterRow({
      id: "r",
      report_date: r.date,
      farm_name: r.farm,
      slaughterhouse_name: r.slaughterhouse,
      animal_type: "Bulls",
      total_count: 68,
      received_count: 66,
      carcass_weight: 17540,
      meat_score: 99,
      report_details: JSON.parse(JSON.stringify(r.details)),
      status: "draft",
    });
    expect(slaughterView(row).score).toBeNull();
    expect(slaughterView(row).meatQuality).toBe(10);
  });
  it("aggregates rejection rates from matching totals and flags missing weight rather than summing zeros", () => {
    const a = report(),
      b = report();
    b.number = 10;
    b.received = 10;
    b.rejected = 0;
    b.carcassWeight = null;
    b.details = undefined;
    const rows = aggregateSlaughter([a, b], "farm");
    expect(rows[0]!.rejectionRate).toBeCloseTo(2 / 78);
    expect(rows[0]!.carcassWeight).toBeNull();
  });
  it("keeps live and carcass rejection stages separate without inflating the number of reports", () => {
    const r = report();
    if (r.details?.version !== 2) throw new Error("fixture");
    r.details.input.cases = [
      {
        kind: "rejection",
        rejectionStage: "live",
        category: "other",
        item: "Live",
        quantity: 1,
        unit: "animal",
        affectedAnimals: 1,
        weight: null,
        reason: "recorded",
      },
      {
        kind: "rejection",
        rejectionStage: "carcass",
        category: "other",
        item: "Carcass",
        quantity: 1,
        unit: "carcass",
        affectedAnimals: 1,
        weight: null,
        reason: "recorded",
      },
    ];
    const rows = aggregateRejectionCases([r]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.stage).sort()).toEqual(["carcass", "live"]);
    expect(rows.every((row) => row.reports === 1)).toBe(true);
  });
});

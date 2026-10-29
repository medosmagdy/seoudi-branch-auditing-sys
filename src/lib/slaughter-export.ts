import { utils, type WorkBook, type WorkSheet } from "xlsx";
import type { SlaughterReport } from "./slaughter-model";
import { aggregateSlaughter, aggregateRejectionCases, slaughterView } from "./slaughter-model";
import { pieces } from "./slaughter-evaluation";
export type SlaughterExportReport = SlaughterReport;
export interface SlaughterExportFilters {
  month?: string;
  animalType?: string;
  query?: string;
  source?: string;
  year?: string;
  farm?: string;
  slaughterhouse?: string;
  season?: string;
}
export const GRAND_HEADERS = [
  "date",
  "Hejri date ",
  "Season",
  "type",
  "Breed",
  "farm",
  "number",
  "received",
  "rejected",
  "rejection reasons",
  "total weight",
  "receiving weight",
  "transportation loss ",
  " carcass weight",
  " kidneys fat quantity",
  "av.total weight",
  "av. Receiving weight",
  "av. Transportation loss",
  "av. Carcass weight",
  "av. Kidneys fat",
  "am",
  "slaughter house hygiene",
  "pm",
  "meat score",
  "meat transportation",
  "wight loss",
  "examination",
  "dressing %",
  "slaughtering evaluation",
  "condemnation",
  "cutting leg ligmants",
  "trimming",
  "heterogenous selection",
  "bad stamping",
  "bruises",
  "accepted as exception",
  "over capacity & rough handling",
  "total rejected weight",
];
const cell = (
  sheet: WorkSheet,
  address: string,
  value: unknown,
  formula?: string,
  format?: string,
) => {
  sheet[address] = {
    t: value instanceof Date || typeof value === "number" ? "n" : "s",
    v: value instanceof Date ? value.getTime() / 86400000 + 25569 : (value ?? ""),
    ...(formula ? { f: formula } : {}),
    ...(format ? { z: format } : {}),
  };
};
const dateValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00Z") : value;
function append(workbook: WorkBook, name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const sheet = utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]!).map(() => ({ wch: 22 }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  utils.book_append_sheet(workbook, sheet, name);
}
function caseText(report: SlaughterReport, kind: "rejection" | "trimming" | "condemnation") {
  const d = report.details;
  return d?.version === 2
    ? d.input.importantNotes[kind]
    : kind === "condemnation"
      ? (report.condemnation ?? "")
      : kind === "trimming"
        ? (report.trimming ?? "")
        : (report.rejectionReasons ?? "");
}
export function buildSlaughterWorkbook(
  reports: SlaughterReport[],
  filters: SlaughterExportFilters = {},
): WorkBook {
  if (!reports.length) throw new Error("لا توجد تقارير مطابقة للتصدير");
  const workbook = utils.book_new();
  const rows = reports.map((report) => {
    const v = slaughterView(report),
      d = report.details;
    return [
      dateValue(report.date),
      v.hijriDate,
      v.season,
      report.animalType,
      v.breed,
      report.farm,
      report.number,
      report.received,
      report.rejected,
      report.rejectionReasons ?? "",
      v.farmWeight,
      v.receivingWeight,
      v.transportationLoss,
      v.carcassWeight,
      v.fatWeight,
      v.averageFarmWeight,
      v.averageReceivingWeight,
      v.averageTransportationLoss,
      v.averageCarcassWeight,
      v.averageFatWeight,
      v.am,
      v.hygiene,
      v.pm,
      v.meatQuality,
      v.transportation,
      v.transportationLossRate,
      v.examination,
      v.dressing,
      v.score === null ? null : v.score / 100,
      v.condemnation,
      (d?.version === 2 ? d.input.observations?.cuttingLegLigaments : report.cuttingLegLigaments) ??
        "",
      caseText(report, "trimming"),
      (d?.version === 2
        ? d.input.observations?.heterogeneousSelection
        : report.heterogeneousSelection) ?? "",
      (d?.version === 2 ? d.input.observations?.badStamping : report.badStamping) ?? "",
      (d?.version === 2 ? d.input.observations?.bruises : report.bruises) ?? "",
      v.acceptedException,
      (d?.version === 2
        ? d.input.observations?.overCapacityRoughHandling
        : report.overCapacityRoughHandling) ?? "",
      v.rejectedWeight,
    ];
  });
  const sheet = utils.aoa_to_sheet([GRAND_HEADERS, ...rows]);
  sheet["!cols"] = GRAND_HEADERS.map((h) => ({
    wch: /reason|condemnation|trimming/.test(h) ? 45 : 20,
  }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  reports.forEach((report, index) => {
    const r = index + 2;
    cell(sheet, `A${r}`, sheet[`A${r}`]?.v ?? report.date, undefined, "dd/mm/yyyy");
    for (const col of ["Z", "AA", "AB", "AC"])
      if (sheet[`${col}${r}`]) sheet[`${col}${r}`].z = "0.00%";
    if (report.details?.version !== 2) return;
    const v = slaughterView(report);
    const formulas: [string, number | null, string, string?][] = [
      ["I", report.rejected, `G${r}-H${r}`],
      ["M", v.transportationLoss, `IF(AND(ISNUMBER(K${r}),ISNUMBER(L${r})),K${r}-L${r},"")`],
      ...(
        [
          ["P", "K", "G", v.averageFarmWeight],
          ["Q", "L", "G", v.averageReceivingWeight],
          ["R", "M", "G", v.averageTransportationLoss],
          ["S", "N", "H", v.averageCarcassWeight],
          ["T", "O", "H", v.averageFatWeight],
          ["Z", "M", "K", v.transportationLossRate],
          ["AB", "N", "K", v.dressing],
        ] as const
      ).map(
        ([out, num, den, value]) =>
          [
            out,
            value,
            `IF(AND(ISNUMBER(${num}${r}),${den}${r}>0),${num}${r}/${den}${r},"")`,
            out === "Z" || out === "AB" ? "0.00%" : "0.00",
          ] as [string, number | null, string, string],
      ),
      ["AA", v.examination, `IF(COUNT(U${r},W${r})=2,AVERAGE(U${r}/25,W${r}/50),"")`, "0.00%"],
      [
        "AC",
        v.score === null ? null : v.score / 100,
        `IF(AND(H${r}>0,COUNT(U${r}:Y${r})=5),SUM(U${r}:Y${r})/100,"")`,
        "0.00%",
      ],
    ];
    for (const [column, value, formula, fmt] of formulas)
      cell(sheet, `${column}${r}`, value, formula, fmt);
  });
  utils.book_append_sheet(workbook, sheet, "Grand Total");
  append(workbook, "Summary", [
    { البيان: "مصدر البيانات", القيمة: filters.source ?? "التقارير المختارة" },
    { البيان: "الشهر", القيمة: filters.month || "كل الشهور" },
    { البيان: "السنة", القيمة: filters.year || "كل السنوات" },
    { البيان: "المزرعة", القيمة: filters.farm || "كل المزارع" },
    { البيان: "المجزر", القيمة: filters.slaughterhouse || "كل المجازر" },
    { البيان: "الموسم", القيمة: filters.season || "كل المواسم" },
    { البيان: "النوع", القيمة: filters.animalType || "كل الأنواع" },
    { البيان: "عدد التقارير", القيمة: reports.length },
    { البيان: "إجمالي الحيوانات", القيمة: reports.reduce((sum, r) => sum + r.number, 0) },
    { البيان: "المستلم", القيمة: reports.reduce((sum, r) => sum + r.received, 0) },
    { البيان: "المرفوض", القيمة: reports.reduce((sum, r) => sum + r.rejected, 0) },
    {
      البيان: "ملاحظة",
      القيمة:
        "Grand Total بنفس ترتيب أعمدة المرجع الـ38. القيم القديمة محفوظة كما وردت دون إعادة حساب. درجات الأجزاء نقاط، والنسب كسور مهيأة كنسب مئوية. الفراغ ليس صفرًا. صور التقرير في تصديره اليومي.",
    },
  ]);
  for (const [by, name] of [
    ["farm", "Farm Summary"],
    ["animalType", "Type Summary"],
    ["year", "Year Summary"],
    ["month", "Month Summary"],
    ["season", "Season Summary"],
  ] as const)
    append(
      workbook,
      name,
      aggregateSlaughter(reports, by).map((r) => ({
        ...r,
        rejectionRate: r.rejectionRate === null ? null : r.rejectionRate * 100,
      })),
    );
  append(
    workbook,
    "Report IDs",
    reports.map((r) => ({
      "Report ID": String(r.id),
      date: r.date,
      farm: r.farm,
      slaughterhouse: r.slaughterhouse,
      status: r.status,
      version: r.details?.version ?? "archive",
    })),
  );
  append(workbook, "Rejection cases", aggregateRejectionCases(reports));
  const checklist = reports.flatMap((report) => {
    const d = report.details;
    return (d?.version === 2 ? d.evaluation.checklist : (d?.checklist ?? [])).map((row) => ({
      "Report ID": String(report.id),
      date: report.date,
      farm: report.farm,
      ...row,
    }));
  });
  append(workbook, "Checklist", checklist);
  const entered = reports
    .filter((r) => r.details)
    .map((report) => {
      const v = slaughterView(report),
        d = report.details!;
      return {
        "Report ID": String(report.id),
        date: report.date,
        farm: report.farm,
        slaughterhouse: report.slaughterhouse,
        "Farm weight": v.farmWeight,
        "Receiving weight": v.receivingWeight,
        "Fat weight": v.fatWeight,
        "Trip duration": d.version === 2 ? d.input.tripDuration : d.tripDuration,
        "Accepted exception": v.acceptedException,
        "Exception rate": v.exceptionRate,
        "Weight source": d.version === 2 ? d.input.weightSource : "not recorded",
        ...(d.version === 2
          ? {
              "Farm location": d.input.farmLocation,
              "Slaughterhouse location": d.input.slaughterhouseLocation,
              Breed: d.input.breed,
              "Hijri date": d.input.hijriDate,
              Season: d.input.season,
              "Rejected weight": d.input.rejectedWeight,
              "Condemnation weight": d.input.condemnationWeight,
              "Weight source note": d.input.weightSourceNote,
              "Rejection notes": d.input.importantNotes.rejection,
              "Trimming notes": d.input.importantNotes.trimming,
              "Condemnation notes": d.input.importantNotes.condemnation,
            }
          : {}),
      };
    });
  append(workbook, "Entered details", entered);
  const trucks = reports.flatMap((r) =>
    r.details?.version === 2
      ? r.details.input.trucks.map((t) => ({
          "Report ID": String(r.id),
          date: r.date,
          farm: r.farm,
          ...t,
        }))
      : [],
  );
  append(workbook, "Trucks", trucks);
  const cases = reports.flatMap((r) =>
    r.details?.version === 2
      ? r.details.input.cases.map((c) => ({
          "Report ID": String(r.id),
          date: r.date,
          farm: r.farm,
          ...c,
          pieces: pieces(c.quantity, c.unit),
        }))
      : [],
  );
  append(workbook, "Cases", cases);
  return workbook;
}
export function buildDailySlaughterWorkbook(report: SlaughterReport): WorkBook {
  const workbook = utils.book_new(),
    v = slaughterView(report),
    d = report.details,
    input = d?.version === 2 ? d.input : null;
  const sheet: WorkSheet = utils.aoa_to_sheet([["Slaughtering Evaluation"]]);
  const fields: Record<string, unknown> = {
    A2: "Department: Quality Assurance",
    E2: "Slaughtering Checklist",
    I2: "Effective date: 1-1-2019",
    A3: "Documents code: QP-23-FM-01",
    A4: "Version: 1",
    A7: "Slaughtering Information",
    B8: "Date",
    D8: dateValue(report.date),
    B9: "Farm",
    D9: report.farm,
    G9: "Location",
    I9: input?.farmLocation ?? "",
    B10: "Slaughterhouse",
    D10: report.slaughterhouse,
    G10: "Location",
    I10: input?.slaughterhouseLocation ?? "",
    B11: "Animal type / Breed",
    D11: [report.animalType, v.breed].filter(Boolean).join(" / "),
    G11: "Trip duration",
    I11: input?.tripDuration ?? (d?.version === 1 ? d.tripDuration : ""),
    B12: "Number",
    D12: report.number,
    B13: "Received",
    D13: report.received,
    G13: "Exception",
    I13: v.acceptedException,
    B14: "Rejected",
    D14: report.rejected,
    G14: "Exception %",
    I14: v.exceptionRate,
    B15: "Farm weight",
    D15: v.farmWeight,
    G15: "Av. farm weight",
    I15: v.averageFarmWeight,
    B16: "Receiving weight",
    D16: v.receivingWeight,
    G16: "Av. receiving weight",
    I16: v.averageReceivingWeight,
    B17: "Rejected weight",
    D17: v.rejectedWeight,
    G17: "Av. rejected weight",
    I17: d?.version === 2 ? d.evaluation.metrics.averageRejectedWeight : null,
    B18: "Transportation loss",
    D18: v.transportationLoss,
    G18: "Trans. Loss %",
    I18: v.transportationLossRate,
    B19: "Carcass weight",
    D19: v.carcassWeight,
    G19: "Av. carcass weight",
    I19: v.averageCarcassWeight,
    B20: "Fat weight",
    D20: v.fatWeight,
    G20: "Av. fat weight",
    I20: v.averageFatWeight,
    B21: "Condemnation",
    D21: v.condemnation,
    G21: "Total cond. weight",
    I21: input?.condemnationWeight ?? null,
    A24: "Chilled trucks",
    B25: "Truck number",
    D25: "Departure temp °C",
    G25: "Truck number",
    I25: "Departure temp °C",
    A31: "Key Performance Indicators (KPIs)",
    D32: "Slaughtering evaluation",
    G32: v.score === null ? null : v.score / 100,
    D33: "AM & PM examination",
    G33: v.examination,
    D34: "Transportation loss",
    G34: v.transportationLossRate,
    D35: "Dressing",
    G35: v.dressing,
    A37: "Important slaughtering notes",
    A38: "Rejection",
    A39: caseText(report, "rejection"),
    A41: "Trimming",
    A42: caseText(report, "trimming"),
    A44: "Condemnation",
    A45: caseText(report, "condemnation"),
    A48: `Report ID: ${report.id}`,
    A49: `Calculation version: ${d?.version ?? "archive"}; empty cells are unavailable, not zero.`,
  };
  for (const [address, value] of Object.entries(fields)) cell(sheet, address, value);
  if (sheet["D8"]) sheet["D8"].z = "dd/mm/yyyy";
  for (const address of ["I14", "I18", "G32", "G33", "G34", "G35"])
    if (sheet[address]) sheet[address].z = "0.00%";
  input?.trucks.slice(0, 6).forEach((truck, index) => {
    cell(sheet, `${index < 3 ? "B" : "G"}${26 + (index % 3)}`, truck.number);
    cell(sheet, `${index < 3 ? "D" : "I"}${26 + (index % 3)}`, truck.temperature);
  });
  if (input && input.trucks.length > 6)
    cell(sheet, "A29", "Additional trucks are in the Trucks worksheet.");
  sheet["!ref"] = "A1:K51";
  sheet["!cols"] = Array.from({ length: 11 }, () => ({ wch: 14 }));
  sheet["!rows"] = Array.from({ length: 51 }, () => ({ hpt: 22 }));
  sheet["!rows"][38] = { hpt: 65 };
  sheet["!rows"][41] = { hpt: 65 };
  sheet["!rows"][44] = { hpt: 85 };
  utils.book_append_sheet(workbook, sheet, "Evaluation");
  const checklist: WorkSheet = utils.aoa_to_sheet([["Meat quality checklist"]]);
  const rowNumbers = [
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    [17, 18, 19],
    [23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43],
    [47, 48, 49, 50],
    [54, 55, 56, 57],
  ];
  const headerRows = [2, 16, 22, 46, 53],
    totalRows = [14, 20, 44, 51, 58];
  const detailRows = d?.version === 2 ? d.evaluation.checklist : (d?.checklist ?? []);
  const sectionNames = [...new Set(detailRows.map((r) => r.section))];
  sectionNames.forEach((name, index) => {
    cell(checklist, `A${headerRows[index]}`, name);
    for (const [col, label] of [
      ["B", "Total"],
      ["C", "Nonconformity / affected animals"],
      ["D", "Degree"],
      ["E", "Notes"],
    ])
      cell(checklist, `${col}${headerRows[index]}`, label);
    const rows = detailRows.filter((r) => r.section === name);
    rows.forEach((row, i) => {
      const number = rowNumbers[index]?.[i];
      if (number === undefined) return;
      cell(checklist, `A${number}`, row.item);
      cell(checklist, `B${number}`, row.maximum);
      cell(checklist, `C${number}`, row.nonconformity);
      cell(
        checklist,
        `D${number}`,
        row.degree,
        d?.version === 2 && "mode" in row && row.mode === "count"
          ? `IF(Evaluation!D13>0,(Evaluation!D13-C${number})/Evaluation!D13*B${number},"")`
          : undefined,
        "0.00",
      );
      cell(checklist, `E${number}`, row.note);
    });
    const degree = rows.some((r) => r.degree === null)
      ? null
      : rows.reduce((sum, r) => sum + r.degree!, 0);
    const totalRow = totalRows[index];
    cell(checklist, `B${totalRow}`, "Total");
    cell(
      checklist,
      `D${totalRow}`,
      degree,
      d?.version === 2
        ? `IF(COUNT(D${rowNumbers[index]![0]}:D${rowNumbers[index]!.at(-1)})=${rows.length},SUM(D${rowNumbers[index]![0]}:D${rowNumbers[index]!.at(-1)}),"")`
        : undefined,
      "0.00",
    );
  });
  cell(checklist, "B59", "SCORE");
  cell(
    checklist,
    "D59",
    v.score === null ? null : v.score / 100,
    d?.version === 2
      ? 'IF(AND(Evaluation!D13>0,COUNT(D14,D20,D44,D51,D58)=5),SUM(D14,D20,D44,D51,D58)/100,"")'
      : undefined,
    "0.00%",
  );
  checklist["!ref"] = "A1:E59";
  checklist["!cols"] = [{ wch: 48 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 70 }];
  utils.book_append_sheet(workbook, checklist, "Checklist");
  if (input) {
    for (const [address, formula] of Object.entries({
      D14: "D12-D13",
      I14: 'IF(D13>0,I13/D13,"")',
      I15: 'IF(AND(ISNUMBER(D15),D12>0),D15/D12,"")',
      I16: 'IF(AND(ISNUMBER(D16),D12>0),D16/D12,"")',
      I17: 'IF(AND(ISNUMBER(D17),D14>0),D17/D14,"")',
      D18: 'IF(AND(ISNUMBER(D15),ISNUMBER(D16)),D15-D16,"")',
      I18: 'IF(AND(ISNUMBER(D18),D15>0),D18/D15,"")',
      I19: 'IF(AND(ISNUMBER(D19),D13>0),D19/D13,"")',
      I20: 'IF(AND(ISNUMBER(D20),D13>0),D20/D13,"")',
      G32: "Checklist!D59",
      G33: 'IF(COUNT(Checklist!D14,Checklist!D44)=2,AVERAGE(Checklist!D14/25,Checklist!D44/50),"")',
      G34: "I18",
      G35: 'IF(AND(ISNUMBER(D19),D15>0),D19/D15,"")',
    }))
      sheet[address].f = formula;
  }
  const pictures = utils.aoa_to_sheet([
    ["Related pictures"],
    ["Images are embedded when available. Historical reports may have no linked photographs."],
  ]);
  pictures["!cols"] = [{ wch: 100 }];
  utils.book_append_sheet(workbook, pictures, "Related pictures");
  if (input) {
    append(
      workbook,
      "Trucks",
      input.trucks.map((r) => ({ ...r })),
    );
    append(
      workbook,
      "Cases",
      input.cases.map((r) => ({ ...r, pieces: pieces(r.quantity, r.unit) })),
    );
    append(workbook, "Daily information", [
      {
        id: String(report.id),
        date: report.date,
        hijriDate: input.hijriDate,
        season: input.season,
        farm: report.farm,
        slaughterhouse: report.slaughterhouse,
        breed: input.breed,
        exceptionRate: v.exceptionRate,
        weightSource: input.weightSource,
        weightSourceNote: input.weightSourceNote,
      },
    ]);
  }
  return workbook;
}

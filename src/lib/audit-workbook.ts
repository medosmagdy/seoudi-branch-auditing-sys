import { auditReportFileBase } from "./audit-report-name";
import XLSX from "xlsx-js-style";
import type { ReportModel } from "./report-data";
import { includesDeliveryInOverall } from "./scoring";
import { isCentralWarehouse, isWarehouseAuditType } from "./location-scope";

type Sheet = XLSX.WorkSheet;
const border = {
  top: { style: "thin", color: { rgb: "CBD5E1" } },
  bottom: { style: "thin", color: { rgb: "CBD5E1" } },
  left: { style: "thin", color: { rgb: "CBD5E1" } },
  right: { style: "thin", color: { rgb: "CBD5E1" } },
};
const styles = {
  text: {
    font: { name: "Arial", sz: 11, color: { rgb: "172B3A" } },
    alignment: { horizontal: "right", vertical: "center", wrapText: true },
    border,
  },
  title: {
    font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "176B55" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  },
  header: {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "16382F" } },
    fill: { fgColor: { rgb: "E2EFD9" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border,
  },
  input: {
    font: { name: "Arial", sz: 11, color: { rgb: "1452AD" } },
    fill: { fgColor: { rgb: "EFF6FF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border,
  },
};
function value(
  sheet: Sheet,
  ref: string,
  v: string | number,
  kind: keyof typeof styles = "text",
  format?: string,
) {
  sheet[ref] = {
    v,
    t: typeof v === "number" ? "n" : "s",
    s: styles[kind],
    ...(format ? { z: format } : {}),
  };
}
function formula(sheet: Sheet, ref: string, f: string, cached: string | number, format?: string) {
  value(sheet, ref, cached, "header", format);
  sheet[ref]!.f = f;
}
const sum = (refs: string[]) => (refs.length ? `SUM(${refs.join(",")})` : "0");
const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
const round2 = (n: number) => Math.round(n * 100) / 100;
export function buildAuditWorkbook(model: ReportModel) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = {
    Views: [{ RTL: true }],
    CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true },
  } as NonNullable<XLSX.WorkBook["Workbook"]>;
  const main: Sheet = {};
  XLSX.utils.book_append_sheet(wb, main, "البيانات");
  const warehouse =
    isCentralWarehouse({ name_ar: model.branchName }) ||
    isWarehouseAuditType({ name_ar: model.auditTypeName, name_en: model.auditTypeNameEn });
  const entity = warehouse ? "المخزن" : "الفرع";
  value(
    main,
    "B2",
    `قائمة مراجعة ${model.auditTypeName} (${warehouse ? "المخازن" : "الفروع"})`,
    "title",
  );
  for (const [row, label, data] of [
    [5, entity, model.branchName],
    [6, `كود ${entity}`, model.branchCode || "—"],
    [7, "التاريخ", model.auditDate],
    [8, "المراجع", model.auditorName],
    [9, `مدير ${entity}`, model.branchManager],
  ] as const) {
    value(main, `B${row}`, label, "header");
    value(main, `C${row}`, data);
  }
  value(main, "E5", "رقم الفحص", "header");
  value(main, "F5", model.auditId);
  value(main, "E6", "الإصدار", "header");
  value(main, "F6", model.version);
  value(main, "E7", "حالة الفحص", "header");
  value(main, "F7", model.status === "submitted" ? "معتمد" : "مسودة");
  value(
    main,
    "B10",
    "الخلايا الزرقاء قابلة للتعديل. غيّر درجة البند في شيت القسم؛ الأقسام والإجمالي يتحدثان تلقائيًا. التعديل هنا لا يغيّر النظام.",
  );
  ["م", "القسم", "الدرجة المحققة", "الدرجة الكلية", "النسبة", "يحتسب بالإجمالي"].forEach(
    (label, i) => value(main, `${String.fromCharCode(66 + i)}11`, label, "header"),
  );
  const inputs: {
    sheet: string;
    scoreCell: string;
    maxCell: string;
    naCell: string;
    questionId: string;
  }[] = [];
  const sectionLinks: {
    sheet: string;
    rawRow: number;
    netRow: number;
    errorCell: string;
    summaryRow: number;
  }[] = [];
  let errors = 0;
  model.sections.forEach((section, index) => {
    let name =
      section.nameAr
        .replace(/[\\/?*:[\]]/g, "")
        .replace(/^'+|'+$/g, "")
        .slice(0, 27)
        .trim() || `قسم ${index + 1}`;
    const base = name;
    let suffix = 1;
    while (wb.SheetNames.some((existing) => existing.toLowerCase() === name.toLowerCase()))
      name = `${base.slice(0, 24)}_${suffix++}`;
    const sheet: Sheet = {};
    XLSX.utils.book_append_sheet(wb, sheet, name);
    value(sheet, "A1", `${index + 1}- ${section.nameAr}`, "title");
    value(sheet, "A3", "القسم غير منطبق؟", "header");
    value(sheet, "B3", section.excluded ? "نعم" : "لا", "input");
    value(
      sheet,
      "A4",
      "عدّل الدرجة باللون الأزرق. للبند غير المنطبق اكتب N/A في عمود الحالة؛ أعدها «ينطبق» لاسترجاع البند.",
    );
    [
      "رقم البند",
      "البند / نص الاشتراط",
      "الملاحظة",
      "الدرجة المستحقة",
      "الدرجة المرجعية",
      "الحالة",
    ].forEach((label, i) => value(sheet, `${String.fromCharCode(65 + i)}6`, label, "header"));
    let row = 7,
      rawEarned = 0,
      rawMax = 0,
      unresolved = 0;
    const groupEarned: string[] = [],
      groupMax: string[] = [],
      groupErrors: string[] = [];
    for (const group of section.groups) {
      if (!group.questions.length) continue;
      value(sheet, `B${row++}`, group.labelAr || "بنود عامة", "header");
      const first = row;
      let earned = 0,
        max = 0,
        invalid = 0;
      for (const q of group.questions) {
        const qMax = q.maxScore > 0 ? q.maxScore : 4;
        const score = q.unresolvedScore || q.score === null ? "" : q.score;
        const active = !section.excluded && !q.isNa;
        const bad = active && (typeof score !== "number" || score < 0 || score > qMax);
        if (active && typeof score === "number") {
          earned += score;
          max += qMax;
        }
        if (bad) invalid++;
        value(sheet, `A${row}`, q.itemId || String(row - first + 1));
        value(sheet, `B${row}`, q.textAr);
        value(sheet, `C${row}`, q.comment);
        value(sheet, `D${row}`, score, "input", "0.00");
        value(sheet, `E${row}`, qMax, "text", "0.00");
        value(sheet, `F${row}`, q.isNa ? "N/A" : "ينطبق", "input");
        const excluded = `OR($B$3="نعم",F${row}="N/A")`;
        formula(
          sheet,
          `G${row}`,
          `IF(${excluded},0,IF(ISNUMBER(D${row}),D${row},0))`,
          active && typeof score === "number" ? score : 0,
        );
        formula(
          sheet,
          `H${row}`,
          `IF(${excluded},0,IF(ISNUMBER(D${row}),E${row},0))`,
          active && typeof score === "number" ? qMax : 0,
        );
        formula(
          sheet,
          `I${row}`,
          `IF(${excluded},0,IF(ISNUMBER(D${row}),IF(OR(D${row}<0,D${row}>E${row}),1,0),1))`,
          bad ? 1 : 0,
        );
        inputs.push({
          sheet: name,
          scoreCell: `D${row}`,
          maxCell: `E${row}`,
          naCell: `F${row}`,
          questionId: q.id,
        });
        row++;
      }
      value(sheet, `B${row}`, `إجمالي ${group.labelAr || "البنود"}`, "header");
      formula(sheet, `D${row}`, `SUM(G${first}:G${row - 1})`, earned, "0.00");
      formula(sheet, `E${row}`, `SUM(H${first}:H${row - 1})`, max, "0.00");
      formula(sheet, `I${row}`, `SUM(I${first}:I${row - 1})`, invalid);
      groupEarned.push(`D${row}`);
      groupMax.push(`E${row}`);
      groupErrors.push(`I${row}`);
      rawEarned += earned;
      rawMax += max;
      unresolved += invalid;
      row++;
    }
    const rawRow = row++;
    value(sheet, `B${rawRow}`, "مجموع درجات البنود", "header");
    formula(sheet, `D${rawRow}`, sum(groupEarned), rawEarned, "0.00");
    formula(sheet, `E${rawRow}`, sum(groupMax), rawMax, "0.00");
    formula(sheet, `I${rawRow}`, sum(groupErrors), unresolved);
    const deductionRefs: string[] = [];
    if (section.deductions.length) {
      value(sheet, `B${row}`, "خصومات القسم المسجلة", "header");
      value(sheet, `C${row}`, "نسبة الخصم %", "header");
      row++;
      for (const ded of section.deductions) {
        value(sheet, `B${row}`, ded.reasonText);
        value(sheet, `C${row}`, ded.percentage / 100, "input", "0.00%");
        deductionRefs.push(`C${row++}`);
      }
    }
    const pct = Math.min(
      100,
      Math.max(
        0,
        section.deductions.reduce((n, d) => n + d.percentage, 0),
      ),
    );
    const deduction = round2((rawMax * pct) / 100);
    value(sheet, `B${row}`, "إجمالي نقاط الخصم", "header");
    formula(
      sheet,
      `D${row}`,
      `ROUND(E${rawRow}*MIN(1,MAX(0,${sum(deductionRefs)})),2)`,
      deduction,
      "0.00",
    );
    const dedRow = row++;
    const netRow = row++;
    value(sheet, `B${netRow}`, "إجمالي القسم الصافي", "header");
    const net = Math.max(0, round2(rawEarned - deduction));
    formula(
      sheet,
      `D${netRow}`,
      `IF($B$3="نعم","N/A",MAX(0,ROUND(D${rawRow}-D${dedRow},2)))`,
      section.excluded ? "N/A" : net,
      "0.00",
    );
    formula(
      sheet,
      `E${netRow}`,
      `IF($B$3="نعم","N/A",E${rawRow})`,
      section.excluded ? "N/A" : rawMax,
      "0.00",
    );
    value(sheet, `B${row}`, "بنود تحتاج مراجعة", "header");
    formula(sheet, `D${row}`, `I${rawRow}`, unresolved);
    const summaryRow = index + 12;
    value(main, `B${summaryRow}`, index + 1);
    value(main, `C${summaryRow}`, section.nameAr);
    formula(
      main,
      `D${summaryRow}`,
      `${quote(name)}!D${netRow}`,
      section.excluded ? "N/A" : net,
      "0.00",
    );
    formula(
      main,
      `E${summaryRow}`,
      `${quote(name)}!E${netRow}`,
      section.excluded ? "N/A" : rawMax,
      "0.00",
    );
    formula(
      main,
      `F${summaryRow}`,
      `IF(ISNUMBER(E${summaryRow}),IF(E${summaryRow}>0,MIN(100,MAX(0,ROUND(D${summaryRow}/E${summaryRow}*100,2)))/100,0),"N/A")`,
      section.excluded
        ? "N/A"
        : rawMax > 0
          ? Math.min(100, Math.max(0, round2((net / rawMax) * 100))) / 100
          : 0,
      "0.00%",
    );
    value(
      main,
      `G${summaryRow}`,
      includesDeliveryInOverall(model.branchName) || !section.isDelivery ? "نعم" : "لا",
    );
    formula(main, `J${summaryRow}`, `${quote(name)}!I${rawRow}`, unresolved);
    errors += unresolved;
    sheet["!ref"] = `A1:I${row + 1}`;
    sheet["!merges"] = [XLSX.utils.decode_range("A1:F1"), XLSX.utils.decode_range("A4:F4")];
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 65 },
      { wch: 35 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { hidden: true },
      { hidden: true },
      { hidden: true },
    ];
    sheet["!rows"] = Array.from({ length: row + 1 }, (_, i) => ({
      hpt: i === 0 ? 32 : i === 3 ? 38 : i === 5 ? 32 : 36,
    }));
    for (const input of inputs.filter((input) => input.sheet === name)) {
      const r = Number(input.scoreCell.slice(1));
      const text = String(sheet[`B${r}`]?.v || "");
      const note = String(sheet[`C${r}`]?.v || "");
      sheet["!rows"]![r - 1] = {
        hpt: Math.max(36, Math.ceil(Math.max(text.length / 55, note.length / 30)) * 16 + 12),
      };
    }
    sheet["!views"] = [{ RTL: true, rightToLeft: true }];
    sectionLinks.push({ sheet: name, rawRow, netRow, errorCell: `I${rawRow}`, summaryRow });
  });
  let row = model.sections.length + 12;
  const last = row - 1,
    totalRow = row++;
  const earnedFormula = last >= 12 ? `ROUND(SUMIFS(D12:D${last},G12:G${last},"نعم"),2)` : "0";
  const maxFormula = last >= 12 ? `SUMIFS(E12:E${last},G12:G${last},"نعم")` : "0";
  value(main, `C${totalRow}`, `إجمالي أقسام ${entity}`, "header");
  formula(main, `D${totalRow}`, earnedFormula, model.result.overallRawScore, "0.00");
  formula(main, `E${totalRow}`, maxFormula, model.result.overallMax, "0.00");
  formula(
    main,
    `F${totalRow}`,
    `IF(E${totalRow}>0,ROUND(D${totalRow}/E${totalRow}*100,2)/100,0)`,
    model.result.overallPercentage / 100,
    "0.00%",
  );
  const generalRefs: string[] = [];
  for (const d of model.generalDeductions) {
    value(main, `B${row}`, "خصم عام", "header");
    value(main, `C${row}`, d.reasonText);
    value(main, `D${row}`, d.percentage / 100, "input", "0.00%");
    generalRefs.push(`D${row++}`);
  }
  const generalRow = row++;
  value(main, `B${generalRow}`, "إجمالي الخصم العام %", "header");
  formula(
    main,
    `C${generalRow}`,
    `MIN(1,MAX(0,${sum(generalRefs)}))`,
    model.result.generalDeductionPercentage / 100,
    "0.00%",
  );
  const finalRow = row++;
  value(main, `B${finalRow}`, "النسبة النهائية", "header");
  formula(
    main,
    `C${finalRow}`,
    `IF(${last >= 12 ? `SUM(J12:J${last})` : "0"}>0,"درجات تحتاج مراجعة",MAX(0,MIN(100,ROUND(F${totalRow}*100-C${generalRow}*100,2)))/100)`,
    errors ? "درجات تحتاج مراجعة" : model.result.finalPercentage / 100,
    "0.00%",
  );
  value(main, `B${row}`, "بنود تحتاج مراجعة", "header");
  formula(main, `C${row}`, last >= 12 ? `SUM(J12:J${last})` : "0", errors);
  main["!ref"] = `A1:J${row + 2}`;
  main["!merges"] = [XLSX.utils.decode_range("B2:G3"), XLSX.utils.decode_range("B10:G10")];
  main["!cols"] = [
    { wch: 3 },
    { wch: 26 },
    { wch: 34 },
    { wch: 20 },
    { wch: 20 },
    { wch: 21 },
    { wch: 22 },
    { hidden: true },
    { hidden: true },
    { hidden: true },
  ];
  main["!rows"] = Array.from({ length: row + 2 }, (_, i) => ({
    hpt: i === 4 ? 44 : i === 9 ? 42 : i === 10 ? 34 : 26,
  }));
  main["!views"] = [{ RTL: true, rightToLeft: true }];
  return {
    workbook: wb,
    filename: `${auditReportFileBase(model)}.xlsx`,
    inputs,
    sections: sectionLinks,
    totalCell: `F${totalRow}`,
    finalCell: `C${finalRow}`,
    unresolvedCount: errors,
  };
}

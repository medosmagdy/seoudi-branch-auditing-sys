// @ts-nocheck -- frozen test oracle preserves the original source exactly.
// Frozen original export body from dashboard.tsx at 5cafb64. Test only.
import type * as XLSXType from "xlsx-js-style";
import type { DashboardData } from "../data";
import type { DashboardDetails } from "../detail-model";
import type { aggregateDashboard } from "../snapshot";
import type { Tables } from "@/integrations/supabase/types";
import { DASHBOARD_PROGRAM_IDS } from "../metrics";
const { FS: FS_TYPE_ID, GHP: GHP_TYPE_ID, FSMS: FSMS_TYPE_ID } = DASHBOARD_PROGRAM_IDS;
const PROGRAM_LABELS = {
  FS: "مؤشرات أقسام سلامة الغذاء",
  GHP: "مؤشرات أقسام النظافة والممارسات الصحية — GHP",
  FSMS: "مؤشرات أقسام أنظمة سلامة الغذاء — FSMS",
} as const;
export type DashboardWorkbookInput = {
  data: DashboardData;
  filteredData: DashboardDetails;
  summary: ReturnType<typeof aggregateDashboard> | null;
  genDeductions: Tables<"audit_general_deductions">[];
  secDeductions: Tables<"audit_section_deductions">[];
};
export function buildDashboardWorkbook(XLSX: typeof XLSXType, { data, filteredData, summary, genDeductions, secDeductions }: DashboardWorkbookInput) {
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = {
      Views: [{ RTL: true }],
      Sheets: [],
    };

    const headerBlueStyle = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "003366" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "002244" } },
        bottom: { style: "thin", color: { rgb: "002244" } },
        left: { style: "thin", color: { rgb: "FFFFFF" } },
        right: { style: "thin", color: { rgb: "FFFFFF" } },
      },
    };

    const monthSeparatorStyle = {
      font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F497D" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top: { style: "medium", color: { rgb: "002244" } },
        bottom: { style: "medium", color: { rgb: "002244" } },
      },
    };

    const cellCenter = {
      font: { name: "Calibri", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "E0E0E0" } },
        bottom: { style: "thin", color: { rgb: "E0E0E0" } },
        left: { style: "thin", color: { rgb: "E0E0E0" } },
        right: { style: "thin", color: { rgb: "E0E0E0" } },
      },
    };

    const cellLeft = {
      font: { name: "Calibri", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: cellCenter.border,
    };

    const cellCode = {
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "003366" } },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { fgColor: { rgb: "F4F8FC" } },
      border: cellCenter.border,
    };

    const dynamicSections = [
      "الأسماك",
      "الجزارة",
      "الجبن",
      "المخبوزات",
      "الخضروات و الفاكهة",
      "الوجبات الجاهزة",
      "المبردات",
      "المجمدات",
      "البقالة الجافة",
      "الاستلامات",
      "عام",
      "التوصيل",
    ];

    const branchHeaders = [
      "Title (كود الفحص)",
      "Branch (الفرع)",
      "AuditDate (التاريخ)",
      "AuditType (نوع الفحص)",
      "Auditor (المراجع)",
      "BranchManager (مدير الفرع)",
      "Status (الحالة)",
      "FinalPercentage (النسبة)",
      "GeneralDeduction (الخصم العام %)",
      "General Deduction Reason (سبب الخصم)",
      ...dynamicSections.map((s) => `قسم ${s}`),
    ];

    const wsBranchesData: Record<string, any> = {};
    const questionMap = new Map(data.questions.map((q) => [q.id, q]));
    const sectionMap = new Map(data.sections.map((s) => [s.id, s]));

    const auditScoresMap: Record<
      string,
      {
        earned: number;
        possible: number;
        secScores: Record<string, { earned: number; possible: number }>;
      }
    > = {};

    const discrepancyLog: Array<{
      auditCode: string;
      branchName: string;
      date: string;
      auditType: string;
      auditorName: string;
      sectionName: string;
      itemId: string;
      questionText: string;
      comment: string;
      score: number;
      maxScore: number;
    }> = [];

    data.answers.forEach((ans) => {
      if (!ans.audit_id || ans.is_na || ans.score === null) return;
      const q = questionMap.get(ans.question_id);
      if (!q) return;
      const sec = sectionMap.get(q.section_id);
      const secName = (sec?.name_ar || "عام").replace(/^قسم\s+/i, "").trim();

      if (!auditScoresMap[ans.audit_id]) {
        auditScoresMap[ans.audit_id] = { earned: 0, possible: 0, secScores: {} };
      }
      const aObj = auditScoresMap[ans.audit_id];
      const max = Number(q.max_score || 4);
      const scr = Number(ans.score);

      aObj.earned += scr;
      aObj.possible += max;

      if (!aObj.secScores[secName]) {
        aObj.secScores[secName] = { earned: 0, possible: 0 };
      }
      aObj.secScores[secName].earned += scr;
      aObj.secScores[secName].possible += max;

      if (scr < max) {
        const audit = data.audits.find((a) => a.id === ans.audit_id);
        const bCode = audit?.branchCode && audit.branchCode !== "—" ? audit.branchCode : "BR";
        const auditCode = `AUD-${bCode}-${(audit?.audit_date || "").replace(/-/g, "")}`;
        discrepancyLog.push({
          auditCode,
          branchName: audit?.branchName || "—",
          date: audit?.audit_date || "—",
          auditType: audit?.typeName || "سلامة الغذاء",
          auditorName: audit?.auditorName || "—",
          sectionName: secName,
          itemId: q.item_id || "—",
          questionText: q.text_ar || "بند الفحص",
          comment: ans.comment?.trim() || "خصم درجات (عدم مطابقة)",
          score: scr,
          maxScore: max,
        });
      }
    });

    const genDeductionMap: Record<string, { pct: number; reasons: string[] }> = {};
    genDeductions.forEach((gd) => {
      if (!genDeductionMap[gd.audit_id]) {
        genDeductionMap[gd.audit_id] = { pct: 0, reasons: [] };
      }
      genDeductionMap[gd.audit_id].pct += Number(gd.percentage || 0);
      if (gd.reason_text?.trim()) {
        genDeductionMap[gd.audit_id].reasons.push(gd.reason_text.trim());
      }
    });

    const sectionIndicatorRows = (typeId: string) => {
      const submittedAudits = filteredData.audits.filter(
        (audit: any) => audit.status === "submitted" && audit.audit_type_id === typeId,
      );
      const auditIds = new Set(submittedAudits.map((audit: any) => audit.id));
      const bySection: Record<string, { name: string; earned: number; possible: number }> = {};

      data.sections
        .filter((section: any) => section.audit_type_id === typeId)
        .forEach((section: any) => {
          bySection[section.id] = {
            name: (section.name_ar || "قسم غير مسمى").replace(/^قسم\\s+/i, "").trim(),
            earned: 0,
            possible: 0,
          };
        });

      data.answers.forEach((answer: any) => {
        if (
          !answer.audit_id ||
          !auditIds.has(answer.audit_id) ||
          answer.is_na ||
          answer.score === null
        )
          return;
        const question = questionMap.get(answer.question_id);
        const section = question ? sectionMap.get(question.section_id) : null;
        if (!section || section.audit_type_id !== typeId || !bySection[section.id]) return;
        const maxScore = Number(question?.max_score || 4);
        bySection[section.id].earned += Number(answer.score);
        bySection[section.id].possible += maxScore;
      });

      return Object.values(bySection).map((row) => ({
        ...row,
        percentage: row.possible > 0 ? Number(((row.earned / row.possible) * 100).toFixed(2)) : 0,
      }));
    };

    const programSectionSheets = [
      { code: "FS", typeId: FS_TYPE_ID },
      { code: "GHP", typeId: GHP_TYPE_ID },
      { code: "FSMS", typeId: FSMS_TYPE_ID },
    ];

    programSectionSheets.forEach(({ code, typeId }) => {
      const rows = sectionIndicatorRows(typeId);
      const sheetRows = [
        [PROGRAM_LABELS[code as keyof typeof PROGRAM_LABELS]],
        ["النسب محسوبة من التدقيقات المعتمدة فقط"],
        ["القسم", "نسبة القسم"],
        ...rows.map((row) => [row.name, `${row.percentage}%`]),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
      sheet["!cols"] = [{ wch: 38 }, { wch: 18 }];
      sheet["!freeze"] = { xSplit: 0, ySplit: 3 };
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:B1");
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell)
            cell.s = row < 3 ? monthSeparatorStyle : row === 2 ? headerBlueStyle : cellCenter;
        }
      }
      XLSX.utils.book_append_sheet(wb, sheet, `${code} - أقسام`);
    });

    const auditsByMonth: Record<string, any[]> = {};
    filteredData.audits.forEach((audit: any) => {
      const mKey = audit.audit_date ? audit.audit_date.slice(0, 7) : "غير محدد";
      if (!auditsByMonth[mKey]) auditsByMonth[mKey] = [];
      auditsByMonth[mKey].push(audit);
    });

    const sortedMonths = Object.keys(auditsByMonth).sort((a, b) => b.localeCompare(a));
    let bRowIdx = 1;
    const branchesMerges: any[] = [];

    sortedMonths.forEach((mKey) => {
      const monthAudits = auditsByMonth[mKey]!;
      const monthTitle = ` 📅 شهر: ${mKey} (إجمالي ${monthAudits.length} زيارة) `;

      wsBranchesData[`A${bRowIdx}`] = { v: monthTitle, t: "s", s: monthSeparatorStyle };
      for (let c = 1; c < branchHeaders.length; c++) {
        wsBranchesData[`${XLSX.utils.encode_col(c)}${bRowIdx}`] = { v: "", s: monthSeparatorStyle };
      }
      branchesMerges.push({
        s: { r: bRowIdx - 1, c: 0 },
        e: { r: bRowIdx - 1, c: branchHeaders.length - 1 },
      });
      bRowIdx++;

      branchHeaders.forEach((hText, cIdx) => {
        const colLetter = XLSX.utils.encode_col(cIdx);
        wsBranchesData[`${colLetter}${bRowIdx}`] = { v: hText, t: "s", s: headerBlueStyle };
      });
      bRowIdx++;

      monthAudits.forEach((audit: any) => {
        const calc = auditScoresMap[audit.id] || { earned: 0, possible: 0, secScores: {} };
        const rawPct = calc.possible > 0 ? (calc.earned / calc.possible) * 100 : null;
        const finalPct =
          rawPct === null
            ? null
            : audit.score !== null && audit.score !== undefined
              ? Number(audit.score)
              : Math.round(rawPct);

        const isPassed = finalPct !== null && finalPct >= 85;
        const scoreStyle = {
          ...cellCenter,
          font: { ...cellCenter.font, bold: true, color: { rgb: isPassed ? "006600" : "CC0000" } },
          fill: { fgColor: { rgb: isPassed ? "EBF7EB" : "FDEEEE" } },
        };

        const gDed = genDeductionMap[audit.id] || { pct: 0, reasons: [] };
        const bCode = audit.branchCode && audit.branchCode !== "—" ? audit.branchCode : "BR";
        const auditCode = `AUD-${bCode}-${(audit.audit_date || "").replace(/-/g, "")}-${String(audit.id).slice(0, 4).toUpperCase()}`;

        const rowValues: any[] = [
          { v: auditCode, s: cellCode },
          { v: audit.branchName || "—", s: cellLeft },
          { v: audit.audit_date || "—", s: cellCenter },
          { v: audit.typeName || "سلامة الغذاء", s: cellCenter },
          { v: audit.auditorName || "—", s: cellLeft },
          { v: audit.branch_manager || "—", s: cellLeft },
          { v: audit.status === "submitted" ? "Approved (معتمد)" : "Draft (مسودة)", s: cellCenter },
          { v: finalPct === null ? "N/A" : `${finalPct}%`, s: scoreStyle },
          {
            v: gDed.pct > 0 ? `${gDed.pct}%` : "0%",
            s: {
              ...cellCenter,
              font: {
                ...cellCenter.font,
                bold: gDed.pct > 0,
                color: { rgb: gDed.pct > 0 ? "CC0000" : "000000" },
              },
            },
          },
          { v: gDed.reasons.length > 0 ? gDed.reasons.join(" | ") : "—", s: cellLeft },
        ];

        dynamicSections.forEach((secTarget) => {
          const sData = Object.entries(calc.secScores).find(
            ([name]) => name.includes(secTarget) || secTarget.includes(name),
          );
          if (sData && sData[1].possible > 0) {
            const sPct = Number(((sData[1].earned / sData[1].possible) * 100).toFixed(2));
            rowValues.push({
              v: `${sPct}%`,
              s: {
                ...cellCenter,
                font: {
                  ...cellCenter.font,
                  bold: true,
                  color: { rgb: sPct >= 85 ? "006600" : "CC0000" },
                },
              },
            });
          } else {
            rowValues.push({ v: "N/A", s: cellCenter });
          }
        });

        rowValues.forEach((valObj, cIdx) => {
          const colLetter = XLSX.utils.encode_col(cIdx);
          wsBranchesData[`${colLetter}${bRowIdx}`] = {
            v: valObj.v,
            t: typeof valObj.v === "number" ? "n" : "s",
            s: valObj.s,
          };
        });

        bRowIdx++;
      });

      bRowIdx++;
    });

    wsBranchesData["!ref"] = `A1:${XLSX.utils.encode_col(branchHeaders.length - 1)}${bRowIdx}`;
    wsBranchesData["!cols"] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 13 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 14 },
      { wch: 18 },
      { wch: 32 },
      ...dynamicSections.map(() => ({ wch: 13 })),
    ];
    wsBranchesData["!merges"] = branchesMerges;
    wsBranchesData["!views"] = [{ rightToLeft: true, RTL: true }];

    XLSX.utils.book_append_sheet(wb, wsBranchesData as any, "الفروع والزيارات");
    (wb as any).Workbook.Sheets.push({ name: "الفروع والزيارات", RTL: true });

    const executiveRows = [
      ["المؤشر", "القيمة"],
      ["إجمالي الزيارات", summary?.totalAudits ?? filteredData.totalAudits],
      ["الفحوصات المعتمدة", summary?.submittedCount ?? filteredData.submittedCount],
      ["المسودات", summary?.draftsCount ?? filteredData.draftsCount],
      [
        "الامتثال الموزون بعد جميع الخصومات",
        summary?.after == null ? "لا توجد فحوصات" : `${summary.after}%`,
      ],
      [
        "الامتثال الموزون قبل جميع الخصومات",
        summary?.before == null ? "لا توجد فحوصات" : `${summary.before}%`,
      ],
      ["حالات عدم المطابقة", summary?.nonCompliant ?? filteredData.totalComments],
      ["المخالفات الحرجة", summary?.critical ?? filteredData.totalCritical],
      ["عدد الفروع", filteredData.totalBranches],
      ["نوع المؤشر", summary?.provisional ? "مبدئي من المتاح" : "حسب البرامج المسجلة"],
      ["تأثير خصومات الأقسام (نقطة مئوية)", summary?.sectionDeduction ?? "—"],
      ["تأثير الخصومات العامة (نقطة مئوية)", summary?.generalDeduction ?? "—"],
    ];
    const wsExecutive = XLSX.utils.aoa_to_sheet(executiveRows);
    wsExecutive["!cols"] = [{ wch: 30 }, { wch: 22 }];
    wsExecutive["!freeze"] = { xSplit: 0, ySplit: 1 };
    wsExecutive["!autofilter"] = { ref: `A1:B${executiveRows.length}` };
    wsExecutive["!views"] = [{ rightToLeft: true }];
    for (const address of ["A1", "B1"]) wsExecutive[address]!.s = headerBlueStyle;
    for (let row = 2; row <= executiveRows.length; row += 1) {
      wsExecutive[`A${row}`]!.s = cellLeft;
      wsExecutive[`B${row}`]!.s = cellCenter;
    }
    if (summary) {
      const rankingSheet = XLSX.utils.aoa_to_sheet([
        ["الترتيب", "الفرع", "قبل الخصومات", "بعد الخصومات", "عدد الزيارات", "البرامج"],
        ...summary.ranking.map((r) => [
          r.rank ?? "—",
          r.branchName,
          r.score?.before ?? "—",
          r.score?.after ?? "لا توجد فحوصات",
          r.visits,
          r.programs.join("، "),
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, rankingSheet, "ترتيب الفروع");
      (wb as any).Workbook.Sheets.push({ name: "ترتيب الفروع", RTL: true });
    }
    XLSX.utils.book_append_sheet(wb, wsExecutive, "الملخص التنفيذي");
    (wb as any).Workbook.Sheets.push({ name: "الملخص التنفيذي", RTL: true });

    const sectionRows = [
      ["البرنامج", "القسم", "عدد الزيارات", "نسبة الامتثال", "حالات عدم المطابقة", "مخالفات حرجة"],
    ];
    filteredData.allSections.forEach((section) => {
      const visits = section.months.reduce((sum, month) => sum + month.branches.length, 0);
      sectionRows.push([
        section.program,
        section.nameAr,
        visits,
        `${section.complianceRate}%`,
        section.commentsCount,
        section.criticalCount,
      ]);
    });
    const wsSections = XLSX.utils.aoa_to_sheet(sectionRows);
    wsSections["!cols"] = [
      { wch: 14 },
      { wch: 32 },
      { wch: 15 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
    ];
    wsSections["!freeze"] = { xSplit: 0, ySplit: 1 };
    wsSections["!autofilter"] = { ref: `A1:F${sectionRows.length}` };
    wsSections["!views"] = [{ rightToLeft: true }];
    for (let col = 0; col < 6; col += 1)
      wsSections[XLSX.utils.encode_cell({ r: 0, c: col })]!.s = headerBlueStyle;
    for (let row = 1; row < sectionRows.length; row += 1) {
      for (let col = 0; col < 6; col += 1)
        wsSections[XLSX.utils.encode_cell({ r: row, c: col })]!.s =
          col === 1 ? cellLeft : cellCenter;
    }
    XLSX.utils.book_append_sheet(wb, wsSections, "مؤشرات الأقسام");
    (wb as any).Workbook.Sheets.push({ name: "مؤشرات الأقسام", RTL: true });

    const wsIssues = XLSX.utils.json_to_sheet(
      discrepancyLog.map((row) => ({
        "كود الفحص": row.auditCode,
        الفرع: row.branchName,
        التاريخ: row.date,
        البرنامج: row.auditType,
        المراجع: row.auditorName,
        القسم: row.sectionName,
        "كود البند": row.itemId,
        "نص البند": row.questionText,
        الملاحظة: row.comment,
        الدرجة: row.score,
        "الدرجة القصوى": row.maxScore,
        "نسبة البند": row.maxScore ? `${Math.round((row.score / row.maxScore) * 100)}%` : "0%",
      })),
    );
    wsIssues["!cols"] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
      { wch: 28 },
      { wch: 16 },
      { wch: 45 },
      { wch: 36 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
    ];
    wsIssues["!freeze"] = { xSplit: 0, ySplit: 1 };
    wsIssues["!views"] = [{ rightToLeft: true }];
    if (wsIssues["!ref"]) {
      wsIssues["!autofilter"] = { ref: wsIssues["!ref"] };
      const range = XLSX.utils.decode_range(wsIssues["!ref"]);
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        wsIssues[XLSX.utils.encode_cell({ r: 0, c: col })]!.s = headerBlueStyle;
      }
      for (let row = 1; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cell = wsIssues[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell) cell.s = col === 7 || col === 8 ? cellLeft : cellCenter;
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsIssues, "سجل الملاحظات");
    (wb as any).Workbook.Sheets.push({ name: "سجل الملاحظات", RTL: true });

    return wb;
}

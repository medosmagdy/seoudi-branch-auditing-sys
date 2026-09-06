import XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { computeAudit, type ScoringSection } from "@/lib/scoring";

const STYLES = {
    headerTitle: {
        font: { name: "Calibri", sz: 16, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "E2EFD9" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "medium", color: { rgb: "000000" } },
            right: { style: "medium", color: { rgb: "000000" } },
        },
    },
    tableHeader: {
        font: { name: "Calibri", sz: 13, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "ADAAAA" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
    sectionSubHeader: {
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "D9D9D9" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
    subTotalRow: {
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "F2F2F2" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
    deductionHeaderRow: {
        font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "9C0006" } },
        fill: { fgColor: { rgb: "FFC7CE" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
    deductionDataRow: {
        font: { name: "Calibri", sz: 11, bold: false, color: { rgb: "9C0006" } },
        fill: { fgColor: { rgb: "FFEBEE" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "D3D3D3" } },
            bottom: { style: "thin", color: { rgb: "D3D3D3" } },
            left: { style: "thin", color: { rgb: "D3D3D3" } },
            right: { style: "thin", color: { rgb: "D3D3D3" } },
        },
    },
    dataCellCenter: {
        font: { name: "Calibri", sz: 11, bold: false, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "D3D3D3" } },
            bottom: { style: "thin", color: { rgb: "D3D3D3" } },
            left: { style: "thin", color: { rgb: "D3D3D3" } },
            right: { style: "thin", color: { rgb: "D3D3D3" } },
        },
    },
    dataCellRight: {
        font: { name: "Calibri", sz: 11, bold: false, color: { rgb: "000000" } },
        alignment: { horizontal: "right", vertical: "center", wrapText: true },
        border: {
            top: { style: "thin", color: { rgb: "D3D3D3" } },
            bottom: { style: "thin", color: { rgb: "D3D3D3" } },
            left: { style: "thin", color: { rgb: "D3D3D3" } },
            right: { style: "thin", color: { rgb: "D3D3D3" } },
        },
    },
    finalScoreHighlight: {
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "000000" } },
        fill: { fgColor: { rgb: "FFFF00" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "medium", color: { rgb: "000000" } },
            right: { style: "medium", color: { rgb: "000000" } },
        },
    },
    metaLabel: {
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
    metaVal: {
        font: { name: "Calibri", sz: 12, bold: false, color: { rgb: "000000" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
        },
    },
};

export async function exportAuditToExcel(auditId: string) {
    const { data: audit, error: auditErr } = await supabase
        .from("audits")
        .select(
            "id, status, version, audit_date, audit_type_id, branch_manager, auditor_id, branches(name_ar, code), audit_types(name_ar, code)"
        )
        .eq("id", auditId)
        .single();

    if (auditErr || !audit) {
        throw new Error("تعذر جلب بيانات الفحص لتصدير الإكسيل");
    }

    const [
        sectionsRes,
        headersRes,
        questionsRes,
        answersRes,
        statusesRes,
        secDeductionsRes,
        genDeductionsRes,
        auditorRes,
    ] = await Promise.all([
        supabase.from("sections").select("*").eq("audit_type_id", audit.audit_type_id).order("order_index"),
        supabase.from("headers").select("*").order("order_index"),
        supabase.from("questions").select("*").eq("audit_type_id", audit.audit_type_id).order("item_order"),
        supabase.from("audit_answers").select("*").eq("audit_id", auditId),
        supabase.from("audit_section_status").select("*").eq("audit_id", auditId),
        supabase.from("audit_section_deductions").select("*").eq("audit_id", auditId),
        supabase.from("audit_general_deductions").select("*").eq("audit_id", auditId),
        supabase.from("profiles").select("full_name, email").eq("id", audit.auditor_id).maybeSingle(),
    ]);

    const sections = sectionsRes.data ?? [];
    const headers = headersRes.data ?? [];
    const questions = questionsRes.data ?? [];
    const answers = answersRes.data ?? [];
    const statuses = statusesRes.data ?? [];
    const secDeductions = secDeductionsRes.data ?? [];
    const genDeductions = genDeductionsRes.data ?? [];

    const branchName = (audit.branches as any)?.name_ar || "فرع غير مسجل";
    const auditTypeName = (audit.audit_types as any)?.name_ar || "سلامة الغذاء";
    const auditTypeCode = (audit.audit_types as any)?.code || "";
    const auditorName = auditorRes.data?.full_name || auditorRes.data?.email || "—";
    const branchManager = audit.branch_manager || "—";
    const auditDate = audit.audit_date || new Date().toISOString().slice(0, 10);

    const isGhpAudit = /ghp/i.test(auditTypeName) || /ghp/i.test(auditTypeCode);

    const naSections = new Set(statuses.filter((s) => s.is_na).map((s) => s.section_id));
    const answerMap = new Map<string, { score: number | null; isNa: boolean; comment: string }>();
    answers.forEach((ans) => {
        answerMap.set(ans.question_id, {
            score: ans.score,
            isNa: ans.is_na,
            comment: ans.comment || "",
        });
    });

    const scoringSections: ScoringSection[] = sections.map((sec) => ({
        id: sec.id,
        nameAr: sec.name_ar,
        nameEn: sec.name_en,
        isDelivery: sec.is_delivery,
        isNa: naSections.has(sec.id),
        questions: questions
            .filter((q) => q.section_id === sec.id)
            .map((q) => ({ id: q.id, maxScore: q.max_score || 4 })),
        deductions: secDeductions
            .filter((d) => d.section_id === sec.id)
            .map((d) => ({ reasonText: d.reason_text, percentage: Number(d.percentage) })),
    }));

    const genDeductionRows = genDeductions.map((d) => ({
        reasonText: d.reason_text,
        percentage: Number(d.percentage),
    }));

    const result = computeAudit(scoringSections, Object.fromEntries(answerMap), genDeductionRows);

    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = {
        Views: [{ RTL: true }],
        Sheets: [],
    };

    // -------------------------------------------------------------
    // الشيت 1: شيت "البيانات"
    // -------------------------------------------------------------
    const wsData: Record<string, any> = {};

    const setCell = (cellRef: string, val: any, style: any) => {
        wsData[cellRef] = {
            v: val,
            t: typeof val === "number" ? "n" : "s",
            s: style,
        };
    };

    setCell("B2", `قائمة مراجعة ${auditTypeName} (الفروع)`, STYLES.headerTitle);
    setCell("B6", "الفرع :", STYLES.metaLabel);
    setCell("C6", branchName, STYLES.metaVal);
    setCell("B7", "التاريخ :", STYLES.metaLabel);
    setCell("C7", auditDate, STYLES.metaVal);
    setCell("B8", "المراجع :", STYLES.metaLabel);
    setCell("C8", auditorName, STYLES.metaVal);
    setCell("B9", "مدير الفرع :", STYLES.metaLabel);
    setCell("C9", branchManager, STYLES.metaVal);

    setCell("B11", "م", STYLES.tableHeader);
    setCell("C11", "القسم", STYLES.tableHeader);
    setCell("D11", "الدرجة المحققة", STYLES.tableHeader);
    setCell("E11", "الدرجة الكلية", STYLES.tableHeader);
    setCell("F11", "النسبة المئوية", STYLES.tableHeader);

    let curRow = 12;
    let sIndex = 1;
    let totalEarnedSum = 0;
    let totalPossibleSum = 0;
    let deliveryEarned = 0;
    let deliveryPossible = 0;

    sections.forEach((sec) => {
        const isExcluded = naSections.has(sec.id);
        const secResult = result.sections.find((s) => s.sectionId === sec.id);

        // حساب الدرجة الصافية بعد الخصم الداخلي للقسم
        const secDeds = secDeductions.filter((d) => d.section_id === sec.id);
        const secDedPct = secDeds.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0);

        let finalSecEarned: number | "N/A" = "N/A";
        let finalSecMax: number | "N/A" = "N/A";
        let finalSecRate = "N/A";

        if (!isExcluded && secResult) {
            const rawEarned = Number(secResult.rawScore);
            const maxPossible = Number(secResult.max);

            // تطبيق خصم القسم
            const deductedEarned = Math.max(0, rawEarned - (maxPossible * (secDedPct / 100)));
            finalSecEarned = Number(deductedEarned.toFixed(1));
            finalSecMax = maxPossible;
            finalSecRate = maxPossible > 0 ? `${Math.round((deductedEarned / maxPossible) * 100)}%` : "100%";

            if (sec.is_delivery) {
                deliveryEarned += deductedEarned;
                deliveryPossible += maxPossible;
            } else {
                totalEarnedSum += deductedEarned;
                totalPossibleSum += maxPossible;
            }
        }

        setCell(`B${curRow}`, sIndex++, STYLES.dataCellCenter);
        setCell(`C${curRow}`, sec.name_ar, STYLES.dataCellRight);
        setCell(`D${curRow}`, finalSecEarned, STYLES.dataCellCenter);
        setCell(`E${curRow}`, finalSecMax, STYLES.dataCellCenter);
        setCell(`F${curRow}`, finalSecRate, STYLES.dataCellCenter);

        curRow++;
    });

    const overallRate = totalPossibleSum > 0 ? `${Math.round((totalEarnedSum / totalPossibleSum) * 100)}%` : "100%";
    setCell(`B${curRow}`, "الإجمالي", STYLES.tableHeader);
    setCell(`C${curRow}`, "إجمالي أقسام الفرع", STYLES.tableHeader);
    setCell(`D${curRow}`, Number(totalEarnedSum.toFixed(1)), STYLES.tableHeader);
    setCell(`E${curRow}`, totalPossibleSum, STYLES.tableHeader);
    setCell(`F${curRow}`, overallRate, STYLES.tableHeader);
    curRow++;

    if (deliveryPossible > 0) {
        const delRate = `${Math.round((deliveryEarned / deliveryPossible) * 100)}%`;
        setCell(`B${curRow}`, "التوصيل", STYLES.tableHeader);
        setCell(`C${curRow}`, "قسم التجارة والتوصيل", STYLES.tableHeader);
        setCell(`D${curRow}`, Number(deliveryEarned.toFixed(1)), STYLES.tableHeader);
        setCell(`E${curRow}`, deliveryPossible, STYLES.tableHeader);
        setCell(`F${curRow}`, delRate, STYLES.tableHeader);
        curRow++;
    }

    setCell(`B${curRow}`, "حالات الخصم العام", STYLES.metaLabel);
    setCell(`C${curRow}`, `${result.totalDeductions || 0}%`, STYLES.dataCellCenter);
    curRow++;

    setCell(`B${curRow}`, "النسبة النهائية المعتمدة", STYLES.tableHeader);
    setCell(`C${curRow}`, `${result.finalScore}%`, STYLES.finalScoreHighlight);

    wsData["!ref"] = `A1:G${curRow + 2}`;
    wsData["!cols"] = [
        { wch: 4 },
        { wch: 22 },
        { wch: 32 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
    ];

    wsData["!merges"] = [{ s: { r: 1, c: 1 }, e: { r: 3, c: 5 } }];
    wsData["!views"] = [{ rightToLeft: true, RTL: true }];

    XLSX.utils.book_append_sheet(wb, wsData as any, "البيانات");
    (wb as any).Workbook.Sheets.push({ name: "البيانات", RTL: true });

    // -------------------------------------------------------------
    // الشيتات التالية: شيتات الأقسام
    // -------------------------------------------------------------
    sections.forEach((sec, idx) => {
        const wsSec: Record<string, any> = {};

        const setSecCell = (cellRef: string, val: any, style: any) => {
            wsSec[cellRef] = {
                v: val,
                t: typeof val === "number" ? "n" : "s",
                s: style,
            };
        };

        const isSectionExcluded = naSections.has(sec.id);
        const secQuestions = questions.filter((q) => q.section_id === sec.id);
        const secHeaders = headers.filter((h) => h.section_id === sec.id);
        const secDeds = secDeductions.filter((d) => d.section_id === sec.id);

        setSecCell("A1", `${idx + 1}- قسم ${sec.name_ar}`, STYLES.headerTitle);

        if (isGhpAudit) {
            setSecCell("A2", "م", STYLES.tableHeader);
            setSecCell("B2", "البند / نص الاشتراط", STYLES.tableHeader);
            setSecCell("C2", "الدرجة المستحقة", STYLES.tableHeader);
            setSecCell("D2", "الدرجة المرجعية", STYLES.tableHeader);
        } else {
            setSecCell("A2", "م", STYLES.tableHeader);
            setSecCell("B2", "البند / نص الاشتراط", STYLES.tableHeader);
            setSecCell("C2", "الملحوظة المسجلة", STYLES.tableHeader);
            setSecCell("D2", "الدرجة المستحقة", STYLES.tableHeader);
            setSecCell("E2", "الدرجة المرجعية", STYLES.tableHeader);
        }

        const groups: { headerLabel: string; questions: typeof questions }[] = [];
        if (secHeaders.length > 0) {
            secHeaders.forEach((h) => {
                const qList = secQuestions.filter((q) => q.header_id === h.id);
                if (qList.length > 0) groups.push({ headerLabel: h.label_ar, questions: qList });
            });
            const noH = secQuestions.filter((q) => !q.header_id);
            if (noH.length > 0) groups.push({ headerLabel: "بنود عامة", questions: noH });
        } else {
            groups.push({ headerLabel: "بنود التفتيش", questions: secQuestions });
        }

        let rRow = 3;
        let itemNumber = 1;
        let secEarnedTotal = 0;
        let secMaxTotal = 0;

        groups.forEach((grp) => {
            setSecCell(`A${rRow}`, "", STYLES.sectionSubHeader);
            setSecCell(`B${rRow}`, `${grp.headerLabel} :`, STYLES.sectionSubHeader);
            setSecCell(`C${rRow}`, "", STYLES.sectionSubHeader);
            setSecCell(`D${rRow}`, "", STYLES.sectionSubHeader);
            if (!isGhpAudit) {
                setSecCell(`E${rRow}`, "", STYLES.sectionSubHeader);
            }
            rRow++;

            let grpEarned = 0;
            let grpMax = 0;

            grp.questions.forEach((q) => {
                const ans = answerMap.get(q.id);
                const itemIsNa = isSectionExcluded || !!ans?.isNa;

                // عند N/A: المستحقة والمرجعية تصبح N/A
                const earned: number | "N/A" = itemIsNa
                    ? "N/A"
                    : ans?.score !== undefined && ans?.score !== null
                        ? Number(ans.score)
                        : Number(q.max_score || 4);

                const max: number | "N/A" = itemIsNa ? "N/A" : Number(q.max_score || 4);
                const note = ans?.comment || "";

                if (typeof earned === "number" && typeof max === "number") {
                    grpEarned += earned;
                    grpMax += max;
                    secEarnedTotal += earned;
                    secMaxTotal += max;
                }

                setSecCell(`A${rRow}`, itemNumber++, STYLES.dataCellCenter);
                setSecCell(`B${rRow}`, q.text_ar, STYLES.dataCellRight);

                if (isGhpAudit) {
                    setSecCell(`C${rRow}`, earned, STYLES.dataCellCenter);
                    setSecCell(`D${rRow}`, max, STYLES.dataCellCenter);
                } else {
                    setSecCell(`C${rRow}`, note, STYLES.dataCellRight);
                    setSecCell(`D${rRow}`, earned, STYLES.dataCellCenter);
                    setSecCell(`E${rRow}`, max, STYLES.dataCellCenter);
                }
                rRow++;
            });

            // صف إجمالي المجموعة الفرعية
            setSecCell(`A${rRow}`, "", STYLES.subTotalRow);
            setSecCell(`B${rRow}`, `إجمالي ${grp.headerLabel}`, STYLES.subTotalRow);

            if (isGhpAudit) {
                setSecCell(`C${rRow}`, isSectionExcluded ? "N/A" : grpEarned, STYLES.subTotalRow);
                setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : grpMax, STYLES.subTotalRow);
            } else {
                setSecCell(`C${rRow}`, "", STYLES.subTotalRow);
                setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : grpEarned, STYLES.subTotalRow);
                setSecCell(`E${rRow}`, isSectionExcluded ? "N/A" : grpMax, STYLES.subTotalRow);
            }
            rRow++;
        });

        // صف إجمالي البنود قبل الخصومات
        setSecCell(`A${rRow}`, "", STYLES.tableHeader);
        setSecCell(`B${rRow}`, "مجموع درجات البنود", STYLES.tableHeader);

        if (isGhpAudit) {
            setSecCell(`C${rRow}`, isSectionExcluded ? "N/A" : secEarnedTotal, STYLES.tableHeader);
            setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : secMaxTotal, STYLES.tableHeader);
        } else {
            setSecCell(`C${rRow}`, "", STYLES.tableHeader);
            setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : secEarnedTotal, STYLES.tableHeader);
            setSecCell(`E${rRow}`, isSectionExcluded ? "N/A" : secMaxTotal, STYLES.tableHeader);
        }
        rRow++;

        // -------------------------------------------------------------
        // إدراج بنود خصومات القسم
        // -------------------------------------------------------------
        let totalDeductionPoints = 0;
        if (!isSectionExcluded && secDeds.length > 0) {
            setSecCell(`A${rRow}`, "", STYLES.deductionHeaderRow);
            setSecCell(`B${rRow}`, "خصومات القسم المسجلة", STYLES.deductionHeaderRow);
            setSecCell(`C${rRow}`, "", STYLES.deductionHeaderRow);
            setSecCell(`D${rRow}`, "قيمة الخصم", STYLES.deductionHeaderRow);
            if (!isGhpAudit) {
                setSecCell(`E${rRow}`, "", STYLES.deductionHeaderRow);
            }
            rRow++;

            secDeds.forEach((ded) => {
                const pct = Number(ded.percentage) || 0;
                const pts = Number(((secMaxTotal * pct) / 100).toFixed(1));
                totalDeductionPoints += pts;

                setSecCell(`A${rRow}`, "خصم", STYLES.deductionDataRow);
                setSecCell(`B${rRow}`, ded.reason_text || "خصم على القسم", STYLES.deductionDataRow);

                if (isGhpAudit) {
                    setSecCell(`C${rRow}`, `-${pts} (${pct}%)`, STYLES.deductionDataRow);
                    setSecCell(`D${rRow}`, "", STYLES.deductionDataRow);
                } else {
                    setSecCell(`C${rRow}`, `نسبة الخصم: ${pct}%`, STYLES.deductionDataRow);
                    setSecCell(`D${rRow}`, -pts, STYLES.deductionDataRow);
                    setSecCell(`E${rRow}`, "", STYLES.deductionDataRow);
                }
                rRow++;
            });
        }

        // صف إجمالي القسم النهائي الصافي بعد الخصم
        const netEarned = Math.max(0, secEarnedTotal - totalDeductionPoints);

        setSecCell(`A${rRow}`, "", STYLES.tableHeader);
        setSecCell(`B${rRow}`, "اجمالي القسم (الصافي المعتمد)", STYLES.tableHeader);

        if (isGhpAudit) {
            setSecCell(`C${rRow}`, isSectionExcluded ? "N/A" : Number(netEarned.toFixed(1)), STYLES.tableHeader);
            setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : secMaxTotal, STYLES.tableHeader);
            wsSec["!ref"] = `A1:E${rRow + 1}`;
            wsSec["!cols"] = [{ wch: 6 }, { wch: 75 }, { wch: 18 }, { wch: 18 }];
            wsSec["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
        } else {
            setSecCell(`C${rRow}`, "", STYLES.tableHeader);
            setSecCell(`D${rRow}`, isSectionExcluded ? "N/A" : Number(netEarned.toFixed(1)), STYLES.tableHeader);
            setSecCell(`E${rRow}`, isSectionExcluded ? "N/A" : secMaxTotal, STYLES.tableHeader);
            wsSec["!ref"] = `A1:F${rRow + 1}`;
            wsSec["!cols"] = [{ wch: 6 }, { wch: 65 }, { wch: 40 }, { wch: 16 }, { wch: 16 }];
            wsSec["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
        }

        wsSec["!views"] = [{ rightToLeft: true, RTL: true }];

        let safeSheetName = sec.name_ar.replace(/[\\/?*:[\]]/g, "").slice(0, 28).trim();
        if (wb.SheetNames.includes(safeSheetName)) {
            safeSheetName = `${safeSheetName.slice(0, 24)}_${idx + 1}`;
        }

        XLSX.utils.book_append_sheet(wb, wsSec as any, safeSheetName);
        (wb as any).Workbook.Sheets.push({ name: safeSheetName, RTL: true });
    });

    const cleanBranch = branchName.replace(/[\\/?*:[\]\s]+/g, "_");
    const cleanType = auditTypeName.replace(/[\\/?*:[\]\s]+/g, "_");
    const fileName = `${cleanType}_${cleanBranch}_${auditDate}.xlsx`;

    XLSX.writeFile(wb, fileName);
}
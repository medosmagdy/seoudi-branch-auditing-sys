import { computeAudit } from "../scoring";
import type { ReportModel, ReportSection } from "../report-data";
export function auditExportFixture(branchName = "فرع تجريبي"): ReportModel {
  const sections: ReportSection[] = [
    {
      id: "food",
      nameAr: "السلامة",
      excluded: false,
      isDelivery: false,
      deductions: [{ id: "d", reasonText: "خصم اختبار", percentage: 10 }],
      groups: [
        {
          id: null,
          labelAr: "بنود التداول",
          questions: [
            {
              id: "q1",
              itemId: "1",
              textAr: "سلامة المنتج",
              maxScore: 4,
              score: 4,
              isNa: false,
              comment: "",
              photos: [],
            },
            {
              id: "q2",
              itemId: "2",
              textAr: "درجات الحرارة",
              maxScore: 4,
              score: 0,
              isNa: false,
              comment: "ملاحظة تجريبية",
              photos: [],
            },
            {
              id: "q3",
              itemId: "3",
              textAr: "بند غير منطبق",
              maxScore: 4,
              score: null,
              isNa: true,
              comment: "",
              photos: [],
            },
          ],
        },
      ],
    },
    {
      id: "delivery",
      nameAr: "التوصيل",
      excluded: false,
      isDelivery: true,
      deductions: [],
      groups: [
        {
          id: null,
          labelAr: "",
          questions: [
            {
              id: "q4",
              itemId: "4",
              textAr: "سلامة النقل",
              maxScore: 4,
              score: 0,
              isNa: false,
              comment: "",
              photos: [],
            },
          ],
        },
      ],
    },
    {
      id: "excluded",
      nameAr: "قسم غير منطبق",
      excluded: true,
      isDelivery: false,
      deductions: [],
      groups: [
        {
          id: null,
          labelAr: "",
          questions: [
            {
              id: "q5",
              itemId: "5",
              textAr: "بند مستبعد",
              maxScore: 4,
              score: 4,
              isNa: false,
              comment: "",
              photos: [],
            },
          ],
        },
      ],
    },
  ];
  const generalDeductions = [{ id: "general", reasonText: "خصم عام تجريبي", percentage: 5 }];
  const result = computeAudit(
    sections.map((s) => ({
      id: s.id,
      nameAr: s.nameAr,
      isNa: s.excluded,
      isDelivery: s.isDelivery,
      deductions: s.deductions,
      questions: s.groups.flatMap((g) =>
        g.questions.map((q) => ({ id: q.id, maxScore: q.maxScore })),
      ),
    })),
    Object.fromEntries(
      sections.flatMap((s) =>
        s.groups.flatMap((g) => g.questions.map((q) => [q.id, { score: q.score, isNa: q.isNa }])),
      ),
    ),
    generalDeductions,
    branchName,
  );
  return {
    auditId: "export-preview",
    createdBy: "actor",
    auditorId: "actor",
    status: "submitted",
    version: 1,
    auditTypeName: "سلامة الغذاء FS",
    auditTypeNameEn: "FS",
    branchName,
    branchCode: "TEST",
    branchManager: "مدير تجريبي",
    auditorName: "مراجع تجريبي",
    auditDate: "2026-10-24",
    sections,
    generalDeductions,
    result,
    history: [],
    ncrs: [],
    allPhotos: [],
  };
}

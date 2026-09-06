/**
 * SBAS scoring engine
 * Section deduction applies strictly to the section.
 * General deduction applies directly to the final overall branch percentage.
 */

export const ALLOWED_SCORES = [4, 2, 1, 0] as const;
export type AllowedScore = (typeof ALLOWED_SCORES)[number];

export interface ScoringQuestion {
  id: string;
  maxScore: number;
}

export interface ScoringSection {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  isDelivery?: boolean;
  isNa?: boolean;
  questions: ScoringQuestion[];
  deductions: { reasonText: string; percentage: number }[];
}

export interface ScoringAnswer {
  score: number | null;
  isNa: boolean;
}

export interface SectionResult {
  id: string;
  sectionId: string;
  nameAr: string;
  nameEn?: string | null;
  isDelivery: boolean;
  excluded: boolean;
  max: number;
  rawScore: number;
  deductionPercentage: number;
  deductionValue: number;
  finalScore: number;
  percentage: number;
}

export interface AuditResult {
  sections: SectionResult[];
  delivery: SectionResult | null;
  overallMax: number;
  overallRawScore: number;
  overallPercentage: number;
  generalDeductionPercentage: number;
  totalDeductions: number;
  finalScore: number;
  finalPercentage: number;
}

const clampPct = (value: number) => Math.min(100, Math.max(0, Number(value) || 0));
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function computeSection(
  section: ScoringSection,
  answers: Record<string, ScoringAnswer | undefined>,
): SectionResult {
  // جمع نسب الخصم الخاصة بالقسم فقط
  const deductionPercentage = clampPct(
    (section.deductions || []).reduce((sum, d) => sum + (Number(d?.percentage) || 0), 0)
  );

  const base = {
    id: section.id,
    sectionId: section.id,
    nameAr: section.nameAr,
    nameEn: section.nameEn ?? null,
    isDelivery: Boolean(section.isDelivery),
    excluded: Boolean(section.isNa),
    deductionPercentage,
  };

  if (section.isNa) {
    return { ...base, max: 0, rawScore: 0, deductionValue: 0, finalScore: 0, percentage: 0 };
  }

  let max = 0;
  let rawScore = 0;

  for (const question of section.questions || []) {
    const answer = answers[question.id];
    if (!answer || answer.isNa || answer.score === null) continue;
    const qMax = Number(question.maxScore) > 0 ? Number(question.maxScore) : 4;
    max += qMax;
    rawScore += Number(answer.score);
  }

  // خصم القسم: يُحسب كنسبة من الدرجة القصوى للقسم ويطرح من نقاط القسم فقط
  const deductionValue = max > 0 ? round2((max * deductionPercentage) / 100) : 0;
  const finalScore = Math.max(0, round2(rawScore - deductionValue));
  const percentage = max > 0 ? clampPct(round2((finalScore / max) * 100)) : 0;

  return { ...base, max, rawScore, deductionValue, finalScore, percentage };
}

export function computeAudit(
  sections: ScoringSection[],
  answers: Record<string, ScoringAnswer | undefined>,
  generalDeductions: { reasonText?: string; percentage: number }[] = [],
): AuditResult {
  const results = (sections || []).map((section) => computeSection(section, answers));

  // عزل قسم التوصيل إن وُجد
  const delivery = results.find((result) => result.isDelivery && !result.excluded) ?? null;

  // الأقسام المحتسبة
  let scored = results.filter((result) => !result.isDelivery && !result.excluded && result.max > 0);

  if (scored.length === 0) {
    scored = results.filter((result) => !result.excluded && result.max > 0);
  }

  // إجمالي الدرجات الممكنة والمحصلة (مخصوم منها خصومات الأقسام داخلياً فقط)
  const overallMax = scored.reduce((sum, result) => sum + result.max, 0);
  const overallRawScore = round2(scored.reduce((sum, result) => sum + result.finalScore, 0));

  // نسبة الفرع قبل الخصم العام
  const overallPercentage = overallMax > 0 ? round2((overallRawScore / overallMax) * 100) : 0;

  // نسبة الخصم العام على الفرع
  const generalDeductionPercentage = clampPct(
    (generalDeductions || []).reduce((sum, d) => sum + (Number(d?.percentage) || 0), 0)
  );

  // النسبة النهائية للفرع = نسبة الفرع مطروحاً منها الخصم العام فقط
  const finalScoreVal = clampPct(round2(overallPercentage - generalDeductionPercentage));

  return {
    sections: results,
    delivery,
    overallMax,
    overallRawScore,
    overallPercentage,
    generalDeductionPercentage,
    totalDeductions: generalDeductionPercentage,
    finalScore: finalScoreVal,
    finalPercentage: finalScoreVal,
  };
}

export function isAnswered(answer: ScoringAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.isNa || answer.score !== null;
}

export function countUnanswered(
  sections: ScoringSection[],
  answers: Record<string, ScoringAnswer | undefined>,
): number {
  return (sections || [])
    .filter((section) => !section.isNa)
    .reduce(
      (total, section) =>
        total + (section.questions || []).filter((question) => !isAnswered(answers[question.id])).length,
      0,
    );
}
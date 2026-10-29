import type { ReportModel } from "./report-data";
import { computeAudit, type ScoringSection } from "./scoring";

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const round = (v: number) => Math.round(v * 100) / 100;
export function summarizeInspector(models: ReportModel[]) {
  const valid = models.filter(
    (m) =>
      !m.sections.some(
        (s) =>
          !s.excluded &&
          s.groups.some((g) =>
            g.questions.some((q) => !q.isNa && (q.unresolvedScore || q.score === null)),
          ),
      ),
  );
  const visits = valid
    .map((model) => {
      const sections: ScoringSection[] = model.sections.map((s) => ({
        id: s.id,
        nameAr: s.nameAr,
        isDelivery: s.isDelivery,
        isNa: s.excluded,
        questions: s.groups.flatMap((g) =>
          g.questions.map((q) => ({ id: q.id, maxScore: q.maxScore })),
        ),
        deductions: s.deductions,
      }));
      const answers = Object.fromEntries(
        model.sections.flatMap((s) =>
          s.groups.flatMap((g) => g.questions.map((q) => [q.id, { score: q.score, isNa: q.isNa }])),
        ),
      );
      const after = computeAudit(sections, answers, model.generalDeductions, model.branchName);
      const before = computeAudit(
        sections.map((s) => ({ ...s, deductions: [] })),
        answers,
        [],
        model.branchName,
      );
      return { model, after, before };
    })
    .filter((v) => v.after.overallMax > 0);
  const branches = new Map<string, { branch: string; program: string; values: number[] }>();
  const sections = new Map<
    string,
    {
      section: string;
      program: string;
      scores: number[];
      full: number;
      itemLoss: number;
      deductionLoss: number;
    }
  >();
  for (const { model, after } of visits) {
    const key = JSON.stringify([model.auditTypeName, model.branchName]);
    const branch = branches.get(key) ?? {
      branch: model.branchName,
      program: model.auditTypeName,
      values: [],
    };
    branch.values.push(after.finalPercentage);
    branches.set(key, branch);
    for (const section of after.sections) {
      if (section.excluded || section.max <= 0) continue;
      const key = JSON.stringify([model.auditTypeName, section.nameAr]);
      const row = sections.get(key) ?? {
        section: section.nameAr,
        program: model.auditTypeName,
        scores: [],
        full: 0,
        itemLoss: 0,
        deductionLoss: 0,
      };
      row.scores.push(section.percentage);
      if (section.percentage === 100) row.full++;
      row.itemLoss += Math.max(0, ((section.max - section.rawScore) / section.max) * 100);
      row.deductionLoss += Math.max(
        0,
        ((section.rawScore - section.finalScore) / section.max) * 100,
      );
      sections.set(key, row);
    }
  }
  const branchRows = [...branches.values()].map((r) => ({
    branch: r.branch,
    program: r.program,
    visits: r.values.length,
    score: round(average(r.values)),
  }));
  const programs = [...new Set(branchRows.map((r) => r.program))].map((program) => {
    const rows = branchRows.filter((r) => r.program === program);
    const high = Math.max(...rows.map((r) => r.score));
    const low = Math.min(...rows.map((r) => r.score));
    return {
      program,
      highest: rows.filter((r) => r.score === high),
      lowest: rows.filter((r) => r.score === low),
    };
  });
  return {
    unresolved: models.length - valid.length,
    scoredVisits: visits.length,
    before: visits.length ? round(average(visits.map((v) => v.before.finalPercentage))) : null,
    after: visits.length ? round(average(visits.map((v) => v.after.finalPercentage))) : null,
    sectionDeduction: visits.length
      ? round(average(visits.map((v) => v.before.finalPercentage - v.after.overallPercentage)))
      : null,
    generalDeduction: visits.length
      ? round(average(visits.map((v) => v.after.overallPercentage - v.after.finalPercentage)))
      : null,
    programs,
    sections: [...sections.values()]
      .map((r) => ({
        ...r,
        visits: r.scores.length,
        score: round(average(r.scores)),
        fullRate: round((r.full / r.scores.length) * 100),
        itemLoss: round(r.itemLoss / r.scores.length),
        deductionLoss: round(r.deductionLoss / r.scores.length),
      }))
      .sort((a, b) => a.score - b.score || a.section.localeCompare(b.section, "ar")),
  };
}

export async function mapLimited<T, R>(
  items: T[],
  map: (item: T) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await map(items[index]!);
      }
    }),
  );
  return results;
}

import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./query-pages";
import { computeAudit, type ScoringAnswer, type ScoringSection } from "./scoring";

type HistoryAudit = {
  id: string;
  audit_date: string;
  score: number | null;
  overall_score: number | null;
};
type AuditContext = { id: string; audit_date: string; branch_id: string; audit_type_id: string };

export async function loadReportHistory(
  audit: AuditContext,
  score: number,
  sections: ScoringSection[],
  branchName: string | undefined,
) {
  const pastAudits = await readAllPages((from, to) =>
    supabase
      .from("audits")
      .select("id, audit_date, score, overall_score")
      .eq("branch_id", audit.branch_id)
      .eq("audit_type_id", audit.audit_type_id)
      .eq("status", "submitted")
      .order("audit_date", { ascending: true })
      .order("id")
      .range(from, to),
  );
  const currentMonth = audit.audit_date.slice(0, 7);
  const historicalScores = await loadHistoricalReportScores(
    pastAudits.filter((row) => row.id !== audit.id && row.audit_date.slice(0, 7) !== currentMonth),
    sections,
    branchName,
  );
  return reportMonthHistory({ date: audit.audit_date, score }, historicalScores);
}

export function reportMonthHistory(
  current: { date: string; score: number },
  historical: { date: string; score: number }[],
) {
  const month = current.date.slice(0, 7);
  const grouped = new Map<string, number[]>();
  const clamp = (score: number) => Math.max(0, Math.min(100, score));
  for (const row of historical) {
    const key = row.date.slice(0, 7);
    if (!key || key === month || !Number.isFinite(row.score)) continue;
    const previous = grouped.get(key) ?? [];
    previous.push(clamp(row.score));
    grouped.set(key, previous);
  }
  const history = Array.from(grouped, ([key, scores]) => ({
    month: key,
    score: Number((scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(2)),
  }));
  history.push({ month, score: clamp(current.score) });
  return history.sort((a, b) => a.month.localeCompare(b.month));
}

export async function loadHistoricalReportScores(
  audits: HistoryAudit[],
  sections: ScoringSection[],
  branchName: string | undefined,
) {
  const questions = sections.flatMap((section) => section.questions);
  const defaultAnswers = Object.fromEntries(
    questions.map(({ id, maxScore }) => [id, { score: maxScore, isNa: false }] as const),
  );
  const entries: { date: string; score: number }[] = [];

  // Fetch only the historical audit IDs visible to the current account. Batch
  // the detail reads and paginate, since one month's answers can exceed the API cap.
  for (let offset = 0; offset < audits.length; offset += 20) {
    const batch = audits.slice(offset, offset + 20);
    const ids = batch.map(({ id }) => id);
    const [answers, statuses, sectionDeductions, generalDeductions] = await Promise.all([
      readAllPages((from, to) =>
        supabase
          .from("audit_answers")
          .select("audit_id, question_id, score, is_na")
          .in("audit_id", ids)
          .order("id")
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("audit_section_status")
          .select("audit_id, section_id, is_na")
          .in("audit_id", ids)
          .order("id")
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("audit_section_deductions")
          .select("audit_id, section_id, percentage")
          .in("audit_id", ids)
          .order("id")
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("audit_general_deductions")
          .select("audit_id, percentage")
          .in("audit_id", ids)
          .order("id")
          .range(from, to),
      ),
    ]);

    for (const audit of batch) {
      const matching = answers.filter(
        (row) => row.audit_id === audit.id && Object.hasOwn(defaultAnswers, row.question_id),
      );
      if (!matching.length) {
        // No usable source answers for a legacy report: preserve its recorded
        // score instead of treating every question as a perfect default.
        entries.push({
          date: audit.audit_date,
          score: Number(audit.score ?? audit.overall_score ?? 0),
        });
        continue;
      }
      const answerMap: Record<string, ScoringAnswer> = { ...defaultAnswers };
      for (const row of matching) {
        answerMap[row.question_id] = { score: row.score, isNa: row.is_na };
      }
      const excluded = new Set(
        statuses
          .filter((row) => row.audit_id === audit.id && row.is_na)
          .map((row) => row.section_id),
      );
      const result = computeAudit(
        sections.map((section) => ({
          ...section,
          isNa: excluded.has(section.id),
          deductions: sectionDeductions
            .filter((d) => d.audit_id === audit.id && d.section_id === section.id)
            .map((d) => ({ percentage: Number(d.percentage), reasonText: "" })),
        })),
        answerMap,
        generalDeductions
          .filter((d) => d.audit_id === audit.id)
          .map((d) => ({ percentage: Number(d.percentage) })),
        branchName,
      );
      entries.push({ date: audit.audit_date, score: result.finalPercentage });
    }
  }
  return entries;
}

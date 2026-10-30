import { saveAuditNaDefaults } from "./audit-na";
import { supabase } from "@/integrations/supabase/client";
import { loadReportModel, type ReportModel } from "@/lib/report-data";

// The report loader already selects active questions for this audit's type.
// Persist inherited N/A only. Never invent full-credit answers during submission.
export function defaultAnswersForReport(model: ReportModel) {
  return model.sections
    .filter((section) => !section.excluded)
    .flatMap((section) => section.groups.flatMap((group) => group.questions))
    .filter((question) => question.isNa)
    .map((question) => ({
      audit_id: model.auditId,
      question_id: question.id,
      score: question.isNa ? null : question.maxScore,
      is_na: !!question.isNa,
      comment: question.isNa ? question.comment || null : null,
    }));
}

export function unresolvedQuestions(model: ReportModel) {
  return model.sections.flatMap((section, sectionIndex) =>
    section.excluded
      ? []
      : section.groups.flatMap((group) =>
          group.questions
            .filter(
              (question) =>
                !question.isNa &&
                (question.answerRecorded === false ||
                  question.unresolvedScore ||
                  typeof question.score !== "number" ||
                  !Number.isFinite(question.score) ||
                  question.score < 0 ||
                  question.score > question.maxScore),
            )
            .map((question) => ({
              sectionIndex,
              sectionName: section.nameAr,
              questionId: question.id,
              itemId: question.itemId,
              text: question.textAr,
            })),
        ),
  );
}
export function assertResolvedScores(model: ReportModel) {
  const unresolved = unresolvedQuestions(model);
  if (unresolved.length)
    throw new Error(
      `لا يمكن اعتماد الفحص: ${unresolved.length} بند بدون تقييم صحيح. ${unresolved
        .slice(0, 5)
        .map((q) => `${q.sectionName || "القسم"}: ${q.itemId || q.questionId}`)
        .join("، ")}. اختر درجة أو حدد غير منطبق.`,
    );
}

export async function finalizeAudit(auditId: string) {
  const before = await loadReportModel(auditId, { includePhotos: false });
  assertResolvedScores(before);
  const defaults = defaultAnswersForReport(before);
  await saveAuditNaDefaults(auditId, {
    answers: [],
    statuses: before.sections
      .filter((section) => section.id)
      .map((section) => ({ section_id: section.id, is_na: section.excluded })),
  });

  if (defaults.length) {
    const { error } = await supabase.from("audit_answers").upsert(defaults, {
      onConflict: "audit_id,question_id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  // Re-read saved answers; the displayed summary can predate the last edit.
  // Keep the existing computeAudit rules, defaults and rounding unchanged.
  const fresh = await loadReportModel(auditId, { includePhotos: false });
  assertResolvedScores(fresh);
  const { result } = fresh;
  const { error } = await supabase
    .from("audits")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      score: result.finalPercentage,
      overall_score: result.overallPercentage,
    })
    .eq("id", auditId)
    .select("id")
    .single();
  if (error) throw error;
  return result;
}

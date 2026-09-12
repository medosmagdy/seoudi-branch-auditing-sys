import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, FolderOpen, Trash2, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { computeAudit, type ScoringSection } from "@/lib/scoring";
import { deletePhoto, signedPhotoUrls, uploadQuestionPhotos } from "@/lib/photos";

type AuditSearchParams = {
  section?: number;
  questionId?: string;
};

export const Route = createFileRoute("/_authenticated/audits/$id/")({
  validateSearch: (search: Record<string, unknown>): AuditSearchParams => {
    const rawSection = search["section"];
    const sectionNum =
      typeof rawSection === "number" ? rawSection : Number(rawSection) || undefined;
    const rawQuestionId = search["questionId"];
    const out: AuditSearchParams = {};
    if (sectionNum !== undefined) out.section = sectionNum;
    if (typeof rawQuestionId === "string") out.questionId = rawQuestionId;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Run Audit — SAS" },
      { name: "description", content: "Score checklist section by section." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditRunner,
});

const SCORE_OPTIONS = [
  { value: 4, label: "4 — مطابق" },
  { value: 2, label: "2 — جزئي" },
  { value: 1, label: "1 — ضعيف" },
  { value: 0, label: "0 — غير مطابق" },
];

const LARGE_BRANCH_NAMES = new Set([
  "العلمين", "مول العرب", "مراسي", "مكرم", "دريم", "واترواي", "مدينتي", "الشروق", "المخازن المركزية",
  "شيراتون", "التجمع", "سيتي", "زايد", "ديستركت5", "هايد بارك",
]);

function getDisabledScore(branchName: string) {
  return LARGE_BRANCH_NAMES.has(branchName) ? 1 : 2;
}

type AnswerState = { score: number | null; isNa: boolean; comment: string };

function AuditRunner() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(search.section ?? 0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [sectionNa, setSectionNa] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const { data: audit, error } = await supabase
        .from("audits")
        .select("id, status, version, audit_date, audit_type_id, branch_manager, branches(name_ar, code), audit_types(name_ar, code)")
        .eq("id", id)
        .single();
      if (error) throw error;

      const [sections, headers, questions, savedAnswers, statuses, sectionDeductions, generalDeductions, photos] =
        await Promise.all([
          supabase.from("sections").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("order_index"),
          supabase.from("headers").select("*").order("order_index"),
          supabase.from("questions").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("item_order"),
          supabase.from("audit_answers").select("*").eq("audit_id", id),
          supabase.from("audit_section_status").select("*").eq("audit_id", id),
          supabase.from("audit_section_deductions").select("*").eq("audit_id", id),
          supabase.from("audit_general_deductions").select("*").eq("audit_id", id),
          supabase.from("photos").select("*").eq("audit_id", id),
        ]);

      return {
        audit,
        sections: sections.data ?? [],
        headers: headers.data ?? [],
        questions: questions.data ?? [],
        savedAnswers: savedAnswers.data ?? [],
        statuses: statuses.data ?? [],
        sectionDeductions: sectionDeductions.data ?? [],
        generalDeductions: generalDeductions.data ?? [],
        photos: photos.data ?? [],
      };
    },
  });

  const isGhpAudit = useMemo(() => {
    const typeName = (data?.audit?.audit_types as { name_ar?: string; code?: string } | null)?.name_ar || "";
    const typeCode = (data?.audit?.audit_types as { name_ar?: string; code?: string } | null)?.code || "";
    return /ghp/i.test(typeName) || /ghp/i.test(typeCode);
  }, [data]);

  useEffect(() => {
    if (search.section !== undefined && search.section !== stepIndex) {
      setStepIndex(search.section);
    }
  }, [search.section]);

  useEffect(() => {
    if (search.questionId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`q-${search.questionId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-destructive", "ring-offset-2");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-destructive", "ring-offset-2");
          }, 3000);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [search.questionId, stepIndex]);

  useEffect(() => {
    if (!data) return;
    const branchName = (data.audit.branches as { name_ar?: string } | null)?.name_ar ?? "";
    const disabledScore = getDisabledScore(branchName);
    const nextAnswers: Record<string, AnswerState> = {};
    data.savedAnswers.forEach((answer) => {
      nextAnswers[answer.question_id] = {
        score: answer.score === disabledScore ? 4 : answer.score,
        isNa: answer.is_na,
        comment: answer.comment ?? "",
      };
    });
    setAnswers(nextAnswers);
    const nextStatus: Record<string, boolean> = {};
    data.statuses.forEach((status) => {
      nextStatus[status.section_id] = status.is_na;
    });
    setSectionNa(nextStatus);
  }, [data]);

  const changeStep = (newIndex: number) => {
    setStepIndex(newIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const photosByQuestion = useMemo(() => {
    const map: Record<string, { id: string; storage_path: string }[]> = {};
    data?.photos.forEach((photo) => {
      map[photo.question_id] = [...(map[photo.question_id] ?? []), photo];
    });
    return map;
  }, [data]);

  const { data: photoUrls } = useQuery({
    queryKey: ["photo-urls", id, data?.photos.length],
    enabled: !!data && data.photos.length > 0,
    queryFn: () => signedPhotoUrls((data?.photos ?? []).map((photo) => photo.storage_path)),
  });

  const scoringSections: ScoringSection[] = useMemo(() => {
    if (!data) return [];
    return data.sections.map((section) => ({
      id: section.id,
      nameAr: section.name_ar,
      nameEn: section.name_en,
      isDelivery: section.is_delivery,
      isNa: !!sectionNa[section.id],
      questions: data.questions
        .filter((question) => question.section_id === section.id)
        .map((question) => ({ id: question.id, maxScore: question.max_score })),
      deductions: data.sectionDeductions
        .filter((deduction) => deduction.section_id === section.id)
        .map((deduction) => ({ reasonText: deduction.reason_text, percentage: Number(deduction.percentage) })),
    }));
  }, [data, sectionNa]);

  const effectiveAnswers = useMemo(() => {
    const map: Record<string, AnswerState> = {};
    if (!data?.questions) return answers;

    data.questions.forEach((q) => {
      if (answers[q.id]) {
        map[q.id] = answers[q.id];
      } else {
        map[q.id] = {
          score: q.max_score ?? 4,
          isNa: false,
          comment: "",
        };
      }
    });

    return map;
  }, [answers, data]);

  const result = useMemo(
    () =>
      computeAudit(
        scoringSections,
        effectiveAnswers,
        (data?.generalDeductions ?? []).map((deduction) => ({
          reasonText: deduction.reason_text,
          percentage: Number(deduction.percentage),
        })),
      ),
    [scoringSections, effectiveAnswers, data],
  );

  const liveStats = useMemo(() => {
    let earned = 0;
    let max = 0;

    if (!data?.questions) return { earned: 0, max: 0, pct: "0.0" };

    data.questions.forEach((q) => {
      if (sectionNa[q.section_id]) return;

      const a = answers[q.id];
      const maxScore = q.max_score ?? 4;

      if (a) {
        if (a.isNa) return;
        earned += a.score !== null ? a.score : maxScore;
        max += maxScore;
      } else {
        earned += maxScore;
        max += maxScore;
      }
    });

    const pct = max > 0 ? ((earned / max) * 100).toFixed(1) : "0.0";
    return { earned, max, pct };
  }, [answers, data, sectionNa]);

  if (isLoading || !data) {
    return (
      <AppShell title="Run Audit">
        <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل…</p>
      </AppShell>
    );
  }

  if (data.sections.length === 0) {
    return (
      <AppShell title="Run Audit" subtitle="No checklist available">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          لم يتم استيراد أو إعداد قائمة تفتيش لهذا التدقيق بعد. اذهب إلى الإدارة واستورد ملف الفحص أولاً.
        </div>
      </AppShell>
    );
  }

  const section = data.sections[Math.min(stepIndex, data.sections.length - 1)]!;
  const sectionQuestions = data.questions.filter((question) => question.section_id === section.id);
  const isNaSection = !!sectionNa[section.id];
  const branch = data.audit.branches as { name_ar: string; code?: string | null } | null;
  const branchName = branch?.name_ar ?? "";
  const branchSystem = LARGE_BRANCH_NAMES.has(branchName) ? "4-2-0" : "4-1-0";
  const disabledScore = getDisabledScore(branchName);
  const readOnly = data.audit.status === "submitted";

  const persistAnswer = (questionId: string, state: AnswerState) => {
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(async () => {
      const { error } = await supabase.from("audit_answers").upsert(
        {
          audit_id: id,
          question_id: questionId,
          score: state.isNa ? null : state.score,
          is_na: state.isNa,
          comment: state.comment.slice(0, 1000) || null,
        },
        { onConflict: "audit_id,question_id" },
      );
      if (error) toast.error("تعذر حفظ الإجابة");
    }, 400);
  };

  const updateAnswer = (questionId: string, patch: Partial<AnswerState>) => {
    if (readOnly || patch.score === disabledScore) return;
    setAnswers((previous) => {
      const current = previous[questionId] ?? { score: null, isNa: false, comment: "" };
      const next = { ...current, ...patch };
      persistAnswer(questionId, next);
      return { ...previous, [questionId]: next };
    });
  };

  const toggleSectionNa = async (value: boolean) => {
    if (readOnly) return;
    setSectionNa((previous) => ({ ...previous, [section.id]: value }));
    const { error } = await supabase
      .from("audit_section_status")
      .upsert({ audit_id: id, section_id: section.id, is_na: value }, { onConflict: "audit_id,section_id" });
    if (error) toast.error("تعذر تحديث حالة القسم");
  };

  const addSectionDeduction = async (reason: string, percentage: number) => {
    const { error } = await supabase
      .from("audit_section_deductions")
      .insert({ audit_id: id, section_id: section.id, reason_text: reason.slice(0, 300), percentage });
    if (error) {
      toast.error("تعذر إضافة الخصم");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["audit", id] });
  };

  const removeSectionDeduction = async (deductionId: string) => {
    await supabase.from("audit_section_deductions").delete().eq("id", deductionId);
    queryClient.invalidateQueries({ queryKey: ["audit", id] });
  };

  const handlePhotos = async (questionId: string, files: File[]) => {
    if (files.length === 0) return;
    try {
      await uploadQuestionPhotos(id, questionId, files);
      queryClient.invalidateQueries({ queryKey: ["audit", id] });
      toast.success(`تم رفع ${files.length} صورة بنجاح`);
    } catch {
      toast.error("تعذر رفع بعض الصور أو كله��");
    }
  };

  const currentDeductions = data.sectionDeductions.filter((deduction) => deduction.section_id === section.id);
  const sectionResult = result.sections.find((entry) => entry.sectionId === section.id);

  return (
    <AppShell
      title={branchName}
      subtitle={`${data.audit.audit_date} · القسم ${stepIndex + 1} من ${data.sections.length}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={readOnly ? "default" : "outline"}>{readOnly ? "معتمد" : "مسودة"}</Badge>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/audits/$id/summary", params: { id } })}>
            الملخص
          </Button>
        </div>
      }
    >
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((stepIndex + 1) / data.sections.length) * 100}%` }}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5" dir="rtl">
        {data.sections.map((entry, index) => (
          <button
            key={entry.id}
            onClick={() => changeStep(index)}
            className={
              index === stepIndex
                ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
                : "rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {index + 1}. {entry.name_ar}
          </button>
        ))}
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-4" dir="rtl">
        <div className="text-right">
          <h2 className="text-lg font-bold">{section.name_ar}</h2>
          {section.is_delivery && (
            <span className="text-xs text-muted-foreground">قسم التوصيل — يتم تقييمه بشكل منفصل</span>
          )}
        </div>
        <div className="mr-auto flex items-center gap-2 text-sm">
          <Label htmlFor="section-na">القسم غير منطبق (N/A)</Label>
          <Switch id="section-na" checked={isNaSection} onCheckedChange={toggleSectionNa} disabled={readOnly} />
        </div>
      </div>

      {!isNaSection && (
        <div className="space-y-4 pb-20">
          {sectionQuestions.map((question) => {
            const answer = answers[question.id] ?? { score: question.max_score ?? 4, isNa: false, comment: "" };
            const header = data.headers.find((entry) => entry.id === question.header_id);
            const needsPhoto =
              question.requires_photo_if_below_max &&
              !answer.isNa &&
              answer.score !== null &&
              answer.score < question.max_score;
            const questionPhotos = photosByQuestion[question.id] ?? [];

            const isHabitItem = question.text_ar.includes("عادات خاطئة") || question.text_ar.includes("العادات الخاطئة") || question.item_id.includes("HABIT");
            const allowComments = !isGhpAudit || isHabitItem;

            const isCcpOrOprp =
              section.name_ar.includes("CCP") ||
              section.name_ar.includes("OPRP") ||
              section.name_ar.includes("نقاط التحكم الحرجة") ||
              (header?.label_ar && (
                header.label_ar.includes("CCP") ||
                header.label_ar.includes("OPRP") ||
                header.label_ar.includes("نقاط التحكم الحرجة")
              ));

            return (
              <div key={question.id} id={`q-${question.id}`} className="surface-card p-4 transition-all duration-300">
                <div dir="rtl" className="text-right">
                  {header && <div className="text-xs font-semibold text-primary">{header.label_ar}</div>}
                  <div className="mt-1 text-[11px] text-muted-foreground font-mono" dir="ltr">
                    {question.item_id}
                  </div>
                  <p className="text-sm font-semibold leading-relaxed text-foreground">{question.text_ar}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2" dir="rtl">
                  {SCORE_OPTIONS.filter((option) => option.value <= question.max_score).map((option) => {
                    const isOptionDisabled =
                      readOnly ||
                      option.value === disabledScore ||
                      (Boolean(isCcpOrOprp) && option.value !== 4 && option.value !== 0);

                    return (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={!answer.isNa && answer.score === option.value ? "default" : "outline"}
                        disabled={isOptionDisabled}
                        onClick={() => updateAnswer(question.id, { score: option.value, isNa: false })}
                        className={isOptionDisabled && !readOnly ? "opacity-30 cursor-not-allowed" : ""}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant={answer.isNa ? "secondary" : "outline"}
                    disabled={readOnly}
                    onClick={() => updateAnswer(question.id, { isNa: !answer.isNa, score: null })}
                  >
                    غير منطبق (N/A)
                  </Button>
                </div>

                {allowComments && (
                  <Textarea
                    className="mt-3 text-xs"
                    placeholder={isHabitItem ? "سجل تفاصيل الملاحظة أو السلوك غير الصحيح هنا..." : "أدخل ملاحظات البند إن وجدت..."}
                    maxLength={1000}
                    dir="rtl"
                    value={answer.comment}
                    disabled={readOnly}
                    onChange={(event) => updateAnswer(question.id, { comment: event.target.value })}
                  />
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!readOnly && (
                    <div className="flex gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                        <Camera className="size-3.5" /> كاميرا
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            void handlePhotos(question.id, Array.from(event.target.files ?? []));
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                        <FolderOpen className="size-3.5" /> ملفات
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            void handlePhotos(question.id, Array.from(event.target.files ?? []));
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {needsPhoto && questionPhotos.length === 0 && (
                    <span className="text-xs text-destructive">إرفاق صورة مطلوب في حال تقليل الدرجة عن الحد الأقصى</span>
                  )}
                </div>

                {questionPhotos.length > 0 && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <div className="flex flex-wrap gap-2">
                      {questionPhotos.map((photo) => (
                        <div key={photo.id} className="relative rounded-lg border border-border p-1 bg-muted/20">
                          <img
                            src={photoUrls?.[photo.storage_path]}
                            alt="Audit evidence"
                            className="size-16 rounded-md object-cover"
                          />
                          {!readOnly && (
                            <button
                              className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-destructive text-destructive-foreground"
                              aria-label="Delete photo"
                              onClick={async () => {
                                await deletePhoto(photo.id, photo.storage_path);
                                queryClient.invalidateQueries({ queryKey: ["audit", id] });
                              }}
                            >
                              <Trash2 className="size-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <SectionDeductions
            deductions={currentDeductions}
            readOnly={readOnly}
            onAdd={addSectionDeduction}
            onRemove={removeSectionDeduction}
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 mb-20">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => changeStep(stepIndex - 1)}>
          <ChevronLeft className="size-4 ml-1" /> السابق
        </Button>
        {stepIndex < data.sections.length - 1 ? (
          <Button className="mr-auto" onClick={() => changeStep(stepIndex + 1)}>
            التالي <ChevronRight className="size-4 mr-1" />
          </Button>
        ) : (
          <Button asChild className="mr-auto font-bold">
            <Link to="/audits/$id/summary" params={{ id }}>
              مراجعة ملخص الفحص <ChevronRight className="size-4 mr-1" />
            </Link>
          </Button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border shadow-lg px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3" dir="rtl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <Award className="size-4 text-emerald-600" />
              <span className="text-[11px] sm:text-xs">المجموع الكلي:</span>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-base sm:text-lg font-black text-foreground">{liveStats.earned}</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">/ {liveStats.max}</span>
            </div>
            <Badge
              variant={Number(liveStats.pct) >= 85 ? "default" : "destructive"}
              className="text-[10px] sm:text-xs font-mono font-bold px-1.5 py-0.5"
            >
              {liveStats.pct}%
            </Badge>
          </div>

          {sectionResult && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs">
              <span className="text-muted-foreground font-semibold">القسم:</span>
              <div className="flex items-baseline gap-0.5 font-mono font-bold text-foreground">
                <span>{sectionResult.rawScore}</span>
                <span className="text-[10px] text-muted-foreground">/{sectionResult.max}</span>
              </div>
              <span
                className={`font-mono font-bold px-1 py-0.2 rounded text-[10px] sm:text-[11px] ${Number(sectionResult.percentage) >= 85
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-destructive/10 text-destructive"
                  }`}
              >
                {Math.round(Number(sectionResult.percentage) || 0)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function SectionDeductions({
  deductions,
  readOnly,
  onAdd,
  onRemove,
}: {
  deductions: { id: string; reason_text: string; percentage: number }[];
  readOnly: boolean;
  onAdd: (reason: string, percentage: number) => void;
  onRemove: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");

  return (
    <div className="surface-card p-4" dir="rtl">
      <h3 className="text-sm font-bold">خصومات داخلية على هذا القسم</h3>
      <div className="mt-3 space-y-2">
        {deductions.map((deduction) => (
          <div key={deduction.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span>{deduction.reason_text}</span>
            <strong className="mr-auto font-mono text-destructive">-{deduction.percentage}%</strong>
            {!readOnly && (
              <button aria-label="Delete deduction" onClick={() => onRemove(deduction.id)}>
                <Trash2 className="size-4 text-destructive" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="flex-1 text-xs"
            placeholder="سبب الخصم في هذا القسم..."
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Input
            className="w-20 text-xs font-mono"
            type="number"
            min={0}
            max={100}
            placeholder="%"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const value = Number(percentage);
              if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
                toast.error("أدخل سبب الخصم ونسبة بين 1 و 100%");
                return;
              }
              onAdd(reason.trim(), value);
              setReason("");
              setPercentage("");
            }}
          >
            إضافة خصم
          </Button>
        </div>
      )}
    </div>
  );
}

import { useAuditSharing } from "@/hooks/useAuditSharing";
import { loadAuditNaDefaults, mergeAuditDefaults, saveAuditNaDefaults } from "@/lib/audit-na";
import { addAuditDeduction, removeAuditDeduction } from "@/lib/audit-deductions";
import { invalidateDashboard } from "@/lib/dashboard/cache";
import { editAnswer, AnswerWrites } from "@/lib/answer-edit";
import { loadAuditAnswers } from "@/lib/audit-answers";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, FolderOpen, Trash2, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { computeAudit, type ScoringSection } from "@/lib/scoring";
import { deletePhoto, signedPhotoUrls, uploadQuestionPhotos } from "@/lib/photos";
import { useSession } from "@/hooks/useSession";
import { canEditAudit } from "@/lib/permissions";

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
      { title: "Run Audit — SQOP" },
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
] as const;

const LARGE_BRANCH_NAMES = new Set([
  "العلمين",
  "مول العرب",
  "مراسي",
  "مكرم",
  "دريم",
  "واترواي",
  "مدينتي",
  "الشروق",
  "المخازن المركزية",
  "شيراتون",
  "التجمع",
  "سيتي",
  "زايد",
  "ديستركت5",
  "هايد بارك",
  "سوديك",
  "Sodic",
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
  const { profile } = useSession();
  const sharing = useAuditSharing();
  const [stepIndex, setStepIndex] = useState(search.section ?? 0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [sectionNa, setSectionNa] = useState<Record<string, boolean>>({});
  const localAnswers = useRef<Record<string, AnswerState>>({});
  const [savingSummary, setSavingSummary] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const photoDeleteLocks = useRef(new Set<string>());
  const [deletingPhotos, setDeletingPhotos] = useState<Set<string>>(new Set());
  const sectionLock = useRef(false);
  const writer = useMemo(
    () =>
      new AnswerWrites<AnswerState>(async (questionId, state) => {
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
        if (error) throw error;
        void invalidateDashboard(queryClient);
      }),
    [id, queryClient],
  );
  const unsavedAnswers = useSyncExternalStore(writer.subscribe, writer.getPendingCount, () => 0);
  useBlocker({
    enableBeforeUnload: () => writer.getPendingCount() > 0 || sectionLock.current,
    shouldBlockFn: async ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      if (sectionLock.current) {
        toast.error("انتظر انتهاء حفظ تعديل القسم قبل الخروج");
        return true;
      }
      try {
        await writer.flush();
        return false;
      } catch {
        toast.error("تعذر حفظ الإجابات؛ تم إيقاف الخروج لحماية تعديلاتك");
        return true;
      }
    },
  });
  useEffect(() => {
    localAnswers.current = {};
  }, [id]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const { data: audit, error } = await supabase
        .from("audits")
        .select(
          "id, status, version, audit_date, created_at, audit_type_id, branch_id, branch_manager, auditor_id, created_by, branches(name_ar, code), audit_types(name_ar, code, scoring_system)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;

      const [
        sections,
        headers,
        questions,
        savedAnswers,
        statuses,
        sectionDeductions,
        generalDeductions,
        photos,
      ] = await Promise.all([
        supabase
          .from("sections")
          .select("*")
          .eq("audit_type_id", audit.audit_type_id)
          .eq("active", true)
          .order("order_index"),
        supabase.from("headers").select("*").order("order_index"),
        supabase
          .from("questions")
          .select("*")
          .eq("audit_type_id", audit.audit_type_id)
          .eq("active", true)
          .order("item_order"),
        loadAuditAnswers(id, audit.audit_type_id),
        supabase.from("audit_section_status").select("*").eq("audit_id", id),
        supabase.from("audit_section_deductions").select("*").eq("audit_id", id),
        supabase.from("audit_general_deductions").select("*").eq("audit_id", id),
        supabase.from("photos").select("*").eq("audit_id", id),
      ]);

      for (const response of [
        sections,
        headers,
        questions,
        statuses,
        sectionDeductions,
        generalDeductions,
        photos,
      ]) {
        if (response.error) throw response.error;
      }

      const inherited = await loadAuditNaDefaults(audit);
      const inheritedStatuses = inherited.statuses.filter((row) =>
        (sections.data ?? []).some((section) => section.id === row.section_id),
      );
      const inheritedAnswers = inherited.answers.filter((row) =>
        (questions.data ?? []).some((question) => question.id === row.question_id),
      );

      return {
        audit,
        sections: sections.data ?? [],
        headers: headers.data ?? [],
        questions: questions.data ?? [],
        savedAnswers,
        statuses: statuses.data ?? [],
        inheritedStatuses,
        inheritedAnswers,
        sectionDeductions: sectionDeductions.data ?? [],
        generalDeductions: generalDeductions.data ?? [],
        photos: photos.data ?? [],
      };
    },
  });

  const auditType = data?.audit?.audit_types as {
    name_ar?: string;
    code?: string;
    scoring_system?: "4-1-0" | "4-2-0" | "4-2-1-0";
  } | null;
  const isGhpAudit = useMemo(
    () => /ghp/i.test(auditType?.name_ar || "") || /ghp/i.test(auditType?.code || ""),
    [auditType],
  );
  const isFsmsAudit = useMemo(
    () => /fsms/i.test(auditType?.name_ar || "") || /fsms/i.test(auditType?.code || ""),
    [auditType],
  );

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
    const auditTypeName =
      (data.audit.audit_types as { name_ar?: string; code?: string } | null) ?? {};
    const isFsms =
      /fsms/i.test(auditTypeName.name_ar || "") || /fsms/i.test(auditTypeName.code || "");
    const nextAnswers: Record<string, AnswerState> = {};
    const answerRows = mergeAuditDefaults(
      data.inheritedAnswers,
      data.savedAnswers,
      (row) => row.question_id,
    );
    answerRows.forEach((answer) => {
      nextAnswers[answer.question_id] = {
        score: answer.score,
        isNa: answer.is_na,
        comment: answer.comment ?? "",
      };
    });
    setAnswers({ ...nextAnswers, ...localAnswers.current });
    const nextStatus: Record<string, boolean> = {};
    const statusRows = mergeAuditDefaults(
      data.inheritedStatuses,
      data.statuses,
      (row) => row.section_id,
    );
    statusRows.forEach((status) => {
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
        .map((deduction) => ({
          reasonText: deduction.reason_text,
          percentage: Number(deduction.percentage),
        })),
    }));
  }, [data, sectionNa]);

  const effectiveAnswers = useMemo(() => {
    const map: Record<string, AnswerState> = {};
    if (!data?.questions) return answers;

    data.questions.forEach((q) => {
      if (answers[q.id]) {
        map[q.id] = answers[q.id]!;
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
        (data?.audit.branches as { name_ar?: string } | null)?.name_ar,
      ),
    [scoringSections, effectiveAnswers, data],
  );

  const liveStats = useMemo(() => {
    if (!data) return { earned: 0, max: 0, pct: "0.0" };

    // Use the same scoring engine as the summary so section exclusions,
    // section deductions, delivery handling, and general deductions agree.
    return {
      earned: result.overallRawScore,
      max: result.overallMax,
      pct: result.finalPercentage.toFixed(1),
    };
  }, [data, result]);

  if (isError) {
    return (
      <AppShell contentClassName="audit-runner-page" title="تعذر تحميل الفحص">
        <div className="py-8 text-center" dir="rtl">
          <p>تعذر تحميل بيانات الفحص كاملة. أعد المحاولة قبل المتابعة.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !data) {
    return (
      <AppShell contentClassName="audit-runner-page" title="Run Audit">
        <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل…</p>
      </AppShell>
    );
  }

  if (data.sections.length === 0) {
    return (
      <AppShell
        contentClassName="audit-runner-page"
        title="Run Audit"
        subtitle="No checklist available"
      >
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          لم يتم استيراد أو إعداد قائمة تفتيش لهذا التدقيق بعد. اذهب إلى الإدارة واستورد ملف الفحص
          أولاً.
        </div>
      </AppShell>
    );
  }

  const section = data.sections[Math.min(stepIndex, data.sections.length - 1)]!;
  const sectionQuestions = data.questions.filter((question) => question.section_id === section.id);
  const isNaSection = !!sectionNa[section.id];
  const branch = data.audit.branches as { name_ar: string; code?: string | null } | null;
  const branchName = branch?.name_ar ?? "";
  const branchSystem = isFsmsAudit
    ? "4-2-0"
    : (auditType?.scoring_system ?? (LARGE_BRANCH_NAMES.has(branchName) ? "4-2-0" : "4-1-0"));
  const disabledScore = isFsmsAudit ? null : getDisabledScore(branchName);
  const readOnly = profile
    ? !canEditAudit({
        sharedUserIds: sharing.peerIds,
        role: profile.role,
        userId: profile.id,
        createdBy: data.audit.created_by,
        auditorId: data.audit.auditor_id,
        status: data.audit.status,
      })
    : true;

  const updateAnswer = (questionId: string, patch: Partial<AnswerState>) => {
    if (readOnly || savingSummary) return;
    const question = data.questions.find((entry) => entry.id === questionId);
    const current = localAnswers.current[questionId] ?? answers[questionId];
    const next = editAnswer(current, patch, question?.max_score ?? 4);
    localAnswers.current[questionId] = next;
    setAnswers((previous) => ({ ...previous, [questionId]: next }));
    void writer
      .enqueue(questionId, next)
      .catch(() => toast.error("تعذر حفظ الإجابة؛ أعد المحاولة قبل الخروج"));
  };

  const openSummary = async () => {
    if (savingSummary || sectionLock.current) return;
    setSavingSummary(true);
    try {
      await writer.flush();
      if (!readOnly)
        await saveAuditNaDefaults(id, {
          answers: data.inheritedAnswers,
          statuses: data.inheritedStatuses,
        });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["audit", id] }),
        queryClient.invalidateQueries({ queryKey: ["audit-summary", id] }),
        queryClient.invalidateQueries({ queryKey: ["audit-report", id] }),
      ]);
      await navigate({ to: "/audits/$id/summary", params: { id } });
    } catch {
      toast.error("تعذر حفظ جميع الإجابات؛ لم يتم فتح الملخص. أعد المحاولة");
    } finally {
      setSavingSummary(false);
    }
  };

  const toggleSectionNa = async (value: boolean) => {
    if (readOnly || savingSummary || sectionLock.current) return;
    sectionLock.current = true;
    setSavingSection(true);
    const sectionId = section.id;
    const previous = !!sectionNa[sectionId];
    setSectionNa((state) => ({ ...state, [sectionId]: value }));
    try {
      const { error } = await supabase
        .from("audit_section_status")
        .upsert(
          { audit_id: id, section_id: sectionId, is_na: value },
          { onConflict: "audit_id,section_id" },
        );
      if (error) throw error;
      void invalidateDashboard(queryClient);
    } catch {
      setSectionNa((state) => ({ ...state, [sectionId]: previous }));
      toast.error("تعذر تحديث حالة القسم؛ تم الاحتفاظ بالحالة السابقة");
    } finally {
      sectionLock.current = false;
      setSavingSection(false);
    }
  };

  const addSectionDeduction = async (reason: string, percentage: number) => {
    if (readOnly || savingSummary || sectionLock.current) return false;
    sectionLock.current = true;
    setSavingSection(true);
    try {
      await addAuditDeduction({ auditId: id, sectionId: section.id }, reason, percentage);
      await queryClient.invalidateQueries({ queryKey: ["audit", id] });
      void invalidateDashboard(queryClient);
      return true;
    } catch {
      toast.error("تعذر إضافة الخصم؛ أعد المحاولة");
      return false;
    } finally {
      sectionLock.current = false;
      setSavingSection(false);
    }
  };

  const removeSectionDeduction = async (deductionId: string) => {
    if (readOnly || savingSummary || sectionLock.current) return;
    sectionLock.current = true;
    setSavingSection(true);
    try {
      await removeAuditDeduction({ auditId: id, sectionId: section.id }, deductionId);
      await queryClient.invalidateQueries({ queryKey: ["audit", id] });
      void invalidateDashboard(queryClient);
    } catch {
      toast.error("تعذر حذف الخصم؛ أعد المحاولة");
    } finally {
      sectionLock.current = false;
      setSavingSection(false);
    }
  };

  const handlePhotos = async (questionId: string, files: File[]) => {
    if (files.length === 0) return;
    try {
      await uploadQuestionPhotos(id, questionId, files);
      queryClient.invalidateQueries({ queryKey: ["audit", id] });
      toast.success(`تم رفع ${files.length} صورة بنجاح`);
    } catch {
      toast.error("تعذر رفع بعض الصور أو كلها");
    }
  };

  const currentDeductions = data.sectionDeductions.filter(
    (deduction) => deduction.section_id === section.id,
  );
  const sectionResult = result.sections.find((entry) => entry.sectionId === section.id);

  return (
    <AppShell
      contentClassName="audit-runner-page"
      title={branchName}
      subtitle={`${data.audit.audit_date} · القسم ${stepIndex + 1} من ${data.sections.length}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={data.audit.status === "submitted" ? "default" : "outline"}>
            {data.audit.status === "submitted" ? "معتمد" : "مسودة"}
          </Badge>
          {readOnly && <Badge variant="secondary">عرض فقط</Badge>}
          <Button
            variant="outline"
            size="sm"
            disabled={savingSummary || savingSection}
            onClick={() => void openSummary()}
          >
            الملخص
          </Button>
        </div>
      }
    >
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        dir="rtl"
      >
        <span>
          {unsavedAnswers
            ? `إجابات لم يتأكد حفظها بعد: ${unsavedAnswers}`
            : "كل تغييرات الإجابات محفوظة"}
        </span>
        {unsavedAnswers > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={savingSummary}
            onClick={() =>
              void writer
                .flush()
                .catch(() => toast.error("تعذر حفظ الإجابات؛ تحقق من الاتصال وأعد المحاولة"))
            }
          >
            إعادة محاولة الحفظ
          </Button>
        )}
        {savingSection && <span>جاري حفظ تعديل القسم…</span>}
      </div>
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

      <div
        className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 p-4 shadow-sm"
        dir="rtl"
      >
        <div className="text-right">
          <h2 className="text-lg font-bold">{section.name_ar}</h2>
          {section.is_delivery && (
            <span className="text-xs text-muted-foreground">
              قسم التوصيل — يتم تقييمه بشكل منفصل
            </span>
          )}
        </div>
        <div className="mr-auto flex items-center gap-2 text-sm">
          <Label htmlFor="section-na">القسم غير منطبق (N/A)</Label>
          <Switch
            id="section-na"
            checked={isNaSection}
            onCheckedChange={toggleSectionNa}
            disabled={readOnly || savingSection || savingSummary}
          />
        </div>
      </div>

      {!isNaSection && (
        <div className="space-y-4 pb-20">
          {sectionQuestions.map((question) => {
            const answer = answers[question.id] ?? {
              score: question.max_score ?? 4,
              isNa: false,
              comment: "",
            };
            const header = data.headers.find((entry) => entry.id === question.header_id);
            const needsPhoto =
              question.requires_photo_if_below_max &&
              !answer.isNa &&
              answer.score !== null &&
              answer.score < question.max_score;
            const questionPhotos = photosByQuestion[question.id] ?? [];

            const isHabitItem =
              question.text_ar.includes("عادات خاطئة") ||
              question.text_ar.includes("العادات الخاطئة") ||
              question.item_id.includes("HABIT");
            const allowComments = !isGhpAudit || isHabitItem;

            const isCcpOrOprp =
              section.name_ar.includes("CCP") ||
              section.name_ar.includes("OPRP") ||
              section.name_ar.includes("نقاط التحكم الحرجة") ||
              (header?.label_ar &&
                (header.label_ar.includes("CCP") ||
                  header.label_ar.includes("OPRP") ||
                  header.label_ar.includes("نقاط التحكم الحرجة")));
            const scoreOptions = isCcpOrOprp
              ? SCORE_OPTIONS.filter((option) => option.value === 4 || option.value === 0)
              : SCORE_OPTIONS;

            return (
              <div
                key={question.id}
                id={`q-${question.id}`}
                className="surface-card border-border/70 p-4 transition-all duration-300 hover:border-primary/30 hover:shadow-sm"
              >
                <div dir="rtl" className="text-right">
                  {header && (
                    <div className="mb-2 rounded-lg border-r-4 border-primary/60 bg-muted/70 px-3 py-2 text-sm font-bold text-foreground shadow-sm">
                      {header.label_ar}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground font-mono" dir="ltr">
                    {question.item_id}
                  </div>
                  <p className="text-sm font-semibold leading-relaxed text-foreground">
                    {question.text_ar}
                  </p>
                </div>

                {!answer.isNa && answer.score === null && (
                  <p className="mt-3 text-sm text-destructive" dir="rtl">
                    درجة هذا البند غير محفوظة. اختر الدرجة الصحيحة أو غير منطبق قبل الاعتماد.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2" dir="rtl">
                  {scoreOptions.map((option) => {
                    const isOptionDisabled =
                      readOnly || (disabledScore !== null && option.value === disabledScore);

                    return (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={
                          !answer.isNa && answer.score === option.value ? "default" : "outline"
                        }
                        disabled={isOptionDisabled}
                        onClick={() =>
                          updateAnswer(question.id, { score: option.value, isNa: false })
                        }
                        className={
                          isOptionDisabled && !readOnly ? "opacity-30 cursor-not-allowed" : ""
                        }
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
                    placeholder={
                      isHabitItem
                        ? "سجل تفاصيل الملاحظة أو السلوك غير الصحيح هنا..."
                        : "أدخل ملاحظات البند إن وجدت..."
                    }
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
                    <span className="text-xs text-destructive">
                      إرفاق صورة مطلوب في حال تقليل الدرجة عن الحد الأقصى
                    </span>
                  )}
                </div>

                {questionPhotos.length > 0 && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <div className="flex flex-wrap gap-2">
                      {questionPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative rounded-lg border border-border p-1 bg-muted/20"
                        >
                          <ImageLightbox
                            src={photoUrls?.[photo.storage_path] ?? ""}
                            alt="Audit evidence"
                            className="size-16"
                            imageClassName="size-16 rounded-md object-cover"
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              disabled={deletingPhotos.has(photo.id)}
                              className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground disabled:opacity-50"
                              aria-label={
                                deletingPhotos.has(photo.id) ? "جارٍ حذف الصورة" : "حذف الصورة"
                              }
                              onClick={async () => {
                                if (photoDeleteLocks.current.has(photo.id)) return;
                                photoDeleteLocks.current.add(photo.id);
                                setDeletingPhotos(new Set(photoDeleteLocks.current));
                                try {
                                  await deletePhoto(photo.id, photo.storage_path);
                                  await queryClient.invalidateQueries({ queryKey: ["audit", id] });
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "تعذر حذف الصورة؛ أعد المحاولة",
                                  );
                                } finally {
                                  photoDeleteLocks.current.delete(photo.id);
                                  setDeletingPhotos(new Set(photoDeleteLocks.current));
                                }
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
            busy={savingSection || savingSummary}
            onAdd={addSectionDeduction}
            onRemove={removeSectionDeduction}
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 mb-20">
        <Button
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => changeStep(stepIndex - 1)}
        >
          <ChevronLeft className="size-4 ml-1" /> السابق
        </Button>
        {stepIndex < data.sections.length - 1 ? (
          <Button className="mr-auto" onClick={() => changeStep(stepIndex + 1)}>
            التالي <ChevronRight className="size-4 mr-1" />
          </Button>
        ) : (
          <Button
            disabled={savingSummary || savingSection}
            onClick={() => void openSummary()}
            className="mr-auto font-bold"
          >
            مراجعة ملخص الفحص <ChevronRight className="size-4 mr-1" />
          </Button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border shadow-lg px-3 py-2 sm:px-4 sm:py-2.5">
        <div
          className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3"
          dir="rtl"
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <Award className="size-4 text-emerald-600" />
              <span className="text-[11px] sm:text-xs">المجموع الكلي:</span>
            </div>
            <div className="flex items-baseline gap-1 font-mono" dir="ltr">
              <span className="text-base sm:text-lg font-black text-foreground">
                {liveStats.earned}
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                / {liveStats.max}
              </span>
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
                className={`font-mono font-bold px-1 py-0.2 rounded text-[10px] sm:text-[11px] ${
                  Number(sectionResult.percentage) >= 85
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
  busy,
}: {
  deductions: { id: string; reason_text: string; percentage: number }[];
  readOnly: boolean;
  onAdd: (reason: string, percentage: number) => Promise<boolean>;
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");

  return (
    <div className="surface-card p-4" dir="rtl">
      <h3 className="text-sm font-bold">خصومات داخلية على هذا القسم</h3>
      <div className="mt-3 space-y-2">
        {deductions.map((deduction) => (
          <div
            key={deduction.id}
            className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
          >
            <span>{deduction.reason_text}</span>
            <strong className="mr-auto font-mono text-destructive">-{deduction.percentage}%</strong>
            {!readOnly && (
              <button disabled={busy} aria-label="حذف الخصم" onClick={() => onRemove(deduction.id)}>
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
            disabled={busy}
          />
          <Input
            className="w-20 text-xs font-mono"
            type="number"
            min={0}
            max={100}
            placeholder="%"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            disabled={busy}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const value = Number(percentage);
              if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
                toast.error("أدخل سبب الخصم ونسبة بين 1 و 100%");
                return;
              }
              if (await onAdd(reason.trim(), value)) {
                setReason("");
                setPercentage("");
              }
            }}
          >
            إضافة خصم
          </Button>
        </div>
      )}
    </div>
  );
}

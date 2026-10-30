import { AuditEmailButton } from "@/components/audit/AuditEmailButton";
import { useAuditSharing } from "@/hooks/useAuditSharing";
import { AuditSummaryScores } from "@/components/audit/AuditSummaryScores";
import { auditReportFileBase } from "@/lib/audit-report-name";
import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Loader2, PenLine, Trash2 } from "lucide-react";
import { addAuditDeduction, removeAuditDeduction } from "@/lib/audit-deductions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loadReportModel } from "@/lib/report-data";
import { logAuditEdit } from "@/lib/audit-log";
import { exportAuditToExcel } from "@/lib/export-audit-excel";
import { ReportDocument } from "@/components/report/ReportDocument";
import { downloadElementAsPdf } from "@/lib/export-pdf";
import { useSession } from "@/hooks/useSession";
import { canEditAudit } from "@/lib/permissions";
import { unresolvedQuestions, finalizeAudit } from "@/lib/finalize-audit";

export const Route = createFileRoute("/_authenticated/audits/$id/summary")({
  head: () => ({
    meta: [
      { title: "Audit Summary — SQOP" },
      {
        name: "description",
        content: "Review section scores, manage general deductions and submit the audit.",
      },
      { property: "og:title", content: "Audit Summary — SQOP" },
      { property: "og:description", content: "Seoudi branch audit summary before submission." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SummaryPage,
});

function SummaryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const sharing = useAuditSharing();
  const reportRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState(false);
  const mutationLock = useRef(false);
  const excelLock = useRef(false);

  const {
    data: model,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["audit-summary", id],
    queryFn: () => loadReportModel(id),
  });

  if (isError) {
    return (
      <AppShell contentClassName="audit-summary-page" title="تعذر تحميل الفحص">
        <div className="py-8 text-center" dir="rtl">
          <p>تعذر تحميل بيانات الفحص كاملة. أعد المحاولة قبل المتابعة.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      </AppShell>
    );
  }

  if (isLoading || !model) {
    return (
      <AppShell contentClassName="audit-summary-page" title="Audit Summary">
        <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل…</p>
      </AppShell>
    );
  }

  const isDraft = model.status === "draft";
  const canEdit = profile
    ? canEditAudit({
        sharedUserIds: sharing.peerIds,
        role: profile.role,
        userId: profile.id,
        createdBy: model.createdBy,
        auditorId: model.auditorId,
        status: model.status,
      })
    : false;

  const exportSummaryPdf = async () => {
    if (!reportRef.current) return;
    try {
      setExportingPdf(true);
      await downloadElementAsPdf(reportRef.current, auditReportFileBase(model));
      toast.success("تم تحميل تقرير الـ PDF بنجاح");
    } catch {
      toast.error("تعذر تصدير تقرير الـ PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const addGeneralDeduction = async () => {
    const value = Number(percentage);
    if (!canEdit) {
      toast.error("لا تملك صلاحية تعديل هذا الفحص");
      return;
    }
    if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error("أدخل سبب الخصم ونسبة بين 1 و 100%");
      return;
    }
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSavingDeduction(true);
    try {
      await addAuditDeduction({ auditId: id }, reason, value);
      await logAuditEdit(id, "general_deduction_added", `${reason.trim()} — ${value}%`).catch(() =>
        toast.error("تم حفظ الخصم، لكن تعذر حفظ سجل التعديل"),
      );
      setReason("");
      setPercentage("");
      await queryClient.invalidateQueries({ queryKey: ["audit-summary", id] });
    } catch {
      toast.error("تعذر إضافة الخصم العام؛ بياناتك ما زالت موجودة لإعادة المحاولة");
    } finally {
      mutationLock.current = false;
      setSavingDeduction(false);
    }
  };

  const removeGeneralDeduction = async (deductionId: string, reasonText: string) => {
    if (!canEdit || mutationLock.current) return;
    mutationLock.current = true;
    setSavingDeduction(true);
    try {
      await removeAuditDeduction({ auditId: id }, deductionId);
      await logAuditEdit(id, "general_deduction_removed", reasonText).catch(() =>
        toast.error("تم حذف الخصم، لكن تعذر حفظ سجل التعديل"),
      );
      await queryClient.invalidateQueries({ queryKey: ["audit-summary", id] });
    } catch {
      toast.error("تعذر حذف الخصم العام؛ أعد المحاولة");
    } finally {
      mutationLock.current = false;
      setSavingDeduction(false);
    }
  };

  const exportSummaryExcel = async () => {
    if (excelLock.current) return;
    excelLock.current = true;
    setExportingExcel(true);
    try {
      await exportAuditToExcel(id);
    } catch {
      toast.error("تعذر تصدير تقرير الإكسيل؛ أعد المحاولة");
    } finally {
      excelLock.current = false;
      setExportingExcel(false);
    }
  };

  const incompleteQuestions = unresolvedQuestions(model);

  const submitAudit = async () => {
    if (!canEdit) {
      toast.error("لا تملك صلاحية اعتماد هذا الفحص");
      return;
    }
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSubmitting(true);

    try {
      const submittedResult = await finalizeAudit(id);

      await logAuditEdit(
        id,
        "submitted",
        `النتيجة النهائية ${submittedResult.finalPercentage}%`,
      ).catch(() => toast.error("تم اعتماد الفحص، لكن تعذر حفظ سجل التعديل"));
      toast.success("تم إنهاء واعتماد الفحص بنجاح!");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["audit-summary", id] }),
        queryClient.invalidateQueries({ queryKey: ["audit-report", id] }),
        queryClient.invalidateQueries({ queryKey: ["audit", id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-data-full"] }),
        queryClient.invalidateQueries({ queryKey: ["audits"] }),
      ]);

      // الانتقال المباشر لتقرير الفحص
      navigate({ to: "/audits/$id/report", params: { id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنهاء واعتماد الفحص");
    } finally {
      mutationLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      contentClassName="audit-summary-page"
      title="ملخص الفحص والتقييم"
      subtitle={`${model.branchName} · ${model.auditDate} · v${model.version}`}
      action={
        <div className="summary-actions flex flex-wrap items-center gap-2">
          <Badge variant={isDraft ? "outline" : "default"}>
            {isDraft ? "مسودة (Draft)" : "معتمد (Completed)"}
          </Badge>

          {/* زر تصدير الإكسيل المباشر */}
          <Button
            size="sm"
            variant="outline"
            onClick={exportSummaryPdf}
            disabled={exportingPdf}
            className="gap-1.5 font-bold border-blue-300 text-blue-700"
          >
            {exportingPdf ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}{" "}
            تحميل PDF
          </Button>

          <Button
            size="sm"
            onClick={() => void exportSummaryExcel()}
            disabled={exportingExcel}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            <FileSpreadsheet className="size-4" /> تقرير الإكسيل (Excel)
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link to="/audits/$id" params={{ id }}>
              <PenLine className="size-4 ml-1" /> بنود التفتيش
            </Link>
          </Button>
        </div>
      }
    >
      <AuditSummaryScores model={model} canEdit={canEdit} />

      <div className="summary-deductions surface-card mt-6 p-5 sm:p-6" dir="rtl">
        <h2 className="font-bold">الخصومات العامة على الفرع</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          أسباب الخصم ونسبته المطبقة على النتيجة الإجمالية.
        </p>
        <div className="mt-3 space-y-2">
          {model.generalDeductions.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد أي خصومات عامة مطبقة.</p>
          )}
          {model.generalDeductions.map((deduction) => (
            <div
              key={deduction.id}
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span>{deduction.reasonText}</span>
              <strong className="mr-auto font-mono text-destructive">
                -{deduction.percentage}%
              </strong>
              <button
                aria-label="حذف الخصم"
                disabled={!canEdit || savingDeduction || submitting}
                onClick={() => void removeGeneralDeduction(deduction.id, deduction.reasonText)}
              >
                <Trash2 className="size-4 text-destructive hover:opacity-80" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
          <Input
            className="flex-1 text-xs"
            aria-label="سبب الخصم العام"
            placeholder="سبب الخصم العام (مثال: عدم ارتداء الزي، تدخين، نظافة الفرع الخارجى)..."
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!canEdit || savingDeduction || submitting}
          />
          <Input
            aria-label="نسبة الخصم العام"
            className="w-full text-xs font-mono"
            type="number"
            min={0}
            max={100}
            placeholder="%"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            disabled={!canEdit || savingDeduction || submitting}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addGeneralDeduction}
            disabled={!canEdit || savingDeduction || submitting}
          >
            إضافة خصم
          </Button>
        </div>
      </div>

      <div className="mt-5 text-xs text-muted-foreground">
        <p>اسم ملف التقرير عند التحميل</p>
        <p className="mt-1 break-words" dir="ltr">
          {auditReportFileBase(model)}
        </p>
      </div>
      <div
        className="summary-pdf-stage pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden"
        aria-hidden="true"
        inert
      >
        <div ref={reportRef} className="w-[900px] bg-white p-4 text-black">
          <ReportDocument model={model} />
        </div>
      </div>

      {isDraft && incompleteQuestions.length > 0 && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-5"
          dir="rtl"
        >
          <h2 className="font-bold text-destructive">
            لا يمكن اعتماد الفحص: {incompleteQuestions.length} سؤال بدون تقييم صحيح
          </h2>
          <p className="mt-2 text-sm">
            اختَر درجة لكل سؤال أو حدده N/A. التعليق والصورة لوحدهم مش تقييم.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {incompleteQuestions.slice(0, 30).map((q) => (
              <Button
                key={q.questionId}
                className="justify-start whitespace-normal text-start"
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/audits/$id",
                    params: { id },
                    search: { section: q.sectionIndex, questionId: q.questionId },
                  })
                }
              >
                {q.sectionName} — {q.itemId}: {q.text}
              </Button>
            ))}
          </div>
          {incompleteQuestions.length > 30 && (
            <p className="mt-2 text-sm">معروض أول 30 سؤال. استكملهم لتظهر بقية البنود.</p>
          )}
        </div>
      )}
      <div
        className="summary-footer surface-card mt-6 flex flex-wrap items-center gap-3 p-5"
        dir="rtl"
      >
        {isDraft && canEdit && (
          <Button
            disabled={submitting || savingDeduction || incompleteQuestions.length > 0}
            onClick={submitAudit}
            className="gap-2 font-bold"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />} اعتماد وإنهاء الفحص
          </Button>
        )}

        <Button
          onClick={() => void exportSummaryExcel()}
          disabled={exportingExcel}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          <FileSpreadsheet className="size-4" /> تصدير تقرير إكسيل (Excel)
        </Button>

        {model.status === "submitted" && <AuditEmailButton auditId={id} />}
        <Button asChild variant="ghost">
          <Link to="/audits/$id" params={{ id }}>
            الرجوع لقائمة الأسئلة
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

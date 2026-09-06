import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, FileSpreadsheet, Loader2, PenLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loadReportModel } from "@/lib/report-data";
import { logAuditEdit } from "@/lib/generate-reports";
import { countUnanswered, type ScoringSection } from "@/lib/scoring";
import { exportAuditToExcel } from "@/lib/export-audit-excel";

export const Route = createFileRoute("/_authenticated/audits/$id/summary")({
  head: () => ({
    meta: [
      { title: "Audit Summary — SBAS" },
      { name: "description", content: "Review section scores, manage general deductions and submit the audit." },
      { property: "og:title", content: "Audit Summary — SBAS" },
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
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: model, isLoading } = useQuery({
    queryKey: ["audit-summary", id],
    queryFn: () => loadReportModel(id),
  });

  const { data: unanswered } = useQuery({
    queryKey: ["audit-unanswered", id, model?.sections.length],
    enabled: !!model,
    queryFn: () => {
      const scoringSections: ScoringSection[] = (model?.sections ?? []).map((section) => ({
        id: section.id,
        nameAr: section.nameAr,
        isDelivery: section.isDelivery,
        isNa: section.excluded,
        questions: section.groups.flatMap((group) =>
          group.questions.map((question) => ({ id: question.id, maxScore: question.maxScore })),
        ),
        deductions: [],
      }));
      const answers: Record<string, { score: number | null; isNa: boolean }> = {};
      (model?.sections ?? []).forEach((section) =>
        section.groups.forEach((group) =>
          group.questions.forEach((question) => {
            answers[question.id] = { score: question.score, isNa: question.isNa };
          }),
        ),
      );
      return countUnanswered(scoringSections, answers);
    },
  });

  const missingErrors = (model?.sections ?? [])
    .map((sec, secIdx) => ({ sec, secIdx }))
    .filter(({ sec }) => !sec.excluded)
    .flatMap(({ sec, secIdx }) =>
      sec.groups.flatMap((grp) =>
        grp.questions
          .filter((q) => !q.isNa && q.score === null)
          .map((q) => ({
            sectionIndex: secIdx,
            sectionName: sec.nameAr,
            questionId: q.id,
            text: q.textAr,
          }))
      )
    );

  if (isLoading || !model) {
    return (
      <AppShell title="Audit Summary">
        <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل…</p>
      </AppShell>
    );
  }

  const { result } = model;
  const isDraft = model.status === "draft";

  const addGeneralDeduction = async () => {
    const value = Number(percentage);
    if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error("أدخل سبب الخصم ونسبة بين 1 و 100%");
      return;
    }
    const { error } = await supabase
      .from("audit_general_deductions")
      .insert({ audit_id: id, reason_text: reason.trim().slice(0, 300), percentage: value } as never);
    if (error) {
      toast.error("تعذر إضافة الخصم العام");
      return;
    }
    await logAuditEdit(id, "general_deduction_added", `${reason.trim()} — ${value}%`);
    setReason("");
    setPercentage("");
    queryClient.invalidateQueries({ queryKey: ["audit-summary", id] });
  };

  const submitAudit = async () => {
    if ((unanswered ?? 0) > 0) {
      toast.error(`يوجد ${unanswered} بند لم يتم تقييمه بعد`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("audits")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        score: result.finalPercentage,
        overall_score: result.overallPercentage,
      } as never)
      .eq("id", id);
    setSubmitting(false);

    if (error) {
      toast.error("تعذر إنهاء واعتماد الفحص");
      return;
    }
    await logAuditEdit(id, "submitted", `النتيجة النهائية ${result.finalPercentage}%`);
    toast.success("تم إنهاء واعتماد الفحص بنجاح!");
    queryClient.invalidateQueries({ queryKey: ["audit-summary", id] });


    // 👇 أضف هذا السطر هنا لنقلك فوراً للتقرير النهائي
    navigate({ to: "/audits/$id/report", params: { id } });
  };

  return (
    <AppShell
      title="ملخص الفحص والتقييم"
      subtitle={`${model.branchName} · ${model.auditDate} · v${model.version}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={isDraft ? "outline" : "default"}>
            {isDraft ? "مسودة (Draft)" : "معتمد (Completed)"}
          </Badge>

          {/* زر تصدير الإكسيل المباشر */}
          <Button
            size="sm"
            onClick={() => exportAuditToExcel(id)}
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
      <div className="grid gap-3 sm:grid-cols-3" dir="rtl">
        <MetricCard label="النسبة قبل الخصم العام" value={`${result.overallPercentage}%`} />
        <MetricCard label="الخصومات العامة على الفرع" value={`${result.generalDeductionPercentage}%`} />
        <div className="brand-banner rounded-2xl p-5 text-center">
          <div className="text-xs opacity-80">النتيجة النهائية</div>
          <div className="text-4xl font-extrabold">{result.finalPercentage}%</div>
        </div>
      </div>

      {missingErrors.length > 0 && isDraft && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4" dir="rtl">
          <div className="flex items-center gap-2 font-bold text-destructive mb-2">
            <AlertCircle className="size-5" />
            <span>يوجد {missingErrors.length} بند يتطلب الإجابة - اضغط على الخطأ للانتقال لمكانه مباشرة:</span>
          </div>
          <div className="space-y-1.5">
            {missingErrors.map((err, i) => (
              <Link
                key={i}
                to="/audits/$id"
                params={{ id }}
                search={{ section: err.sectionIndex, questionId: err.questionId }}
                className="flex items-center justify-between rounded-md bg-background/80 p-2.5 text-xs text-foreground shadow-sm hover:bg-background transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{err.sectionName}</Badge>
                  <span>{err.text}</span>
                </div>
                <span className="flex items-center text-primary font-semibold">
                  تصحيح في ({err.sectionName}) <ArrowRight className="size-3 mr-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="surface-card mt-4 overflow-x-auto p-0" dir="rtl">
        <table className="w-full text-sm text-right">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">القسم</th>
              <th className="p-3">الدرجة</th>
              <th className="p-3">خصم القسم</th>
              <th className="p-3">النسبة المئوية</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {result.sections.map((entry, index) => (
              <tr key={entry.sectionId} className="border-t border-border">
                <td className="p-3">
                  <Link
                    to="/audits/$id"
                    params={{ id }}
                    search={{ section: index }}
                    className="text-primary hover:underline font-semibold"
                  >
                    {entry.nameAr}
                  </Link>
                  {entry.isDelivery && (
                    <span className="mr-2 text-xs text-muted-foreground">
                      (توصيل — تقييم منفصل)
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono">
                  {entry.excluded ? "N/A" : `${entry.finalScore} / ${entry.max}`}
                </td>
                <td className="p-3 font-mono text-destructive">
                  {entry.excluded ? "—" : `${entry.deductionPercentage}%`}
                </td>
                <td className="p-3 font-bold font-mono">
                  {entry.excluded ? "—" : `${entry.percentage}%`}
                </td>
                <td className="p-3 text-left">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/audits/$id" params={{ id }} search={{ section: index }}>
                      تعديل
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="surface-card mt-4 p-4" dir="rtl">
        <h3 className="text-sm font-bold">الخصومات العامة على الفرع (General deductions)</h3>
        <div className="mt-3 space-y-2">
          {model.generalDeductions.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد أي خصومات عامة مطبقة.</p>
          )}
          {model.generalDeductions.map((deduction) => (
            <div key={deduction.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span>{deduction.reasonText}</span>
              <strong className="mr-auto font-mono text-destructive">-{deduction.percentage}%</strong>
              <button
                aria-label="حذف الخصم"
                onClick={async () => {
                  await supabase.from("audit_general_deductions").delete().eq("id", deduction.id);
                  await logAuditEdit(id, "general_deduction_removed", deduction.reasonText);
                  queryClient.invalidateQueries({ queryKey: ["audit-summary", id] });
                }}
              >
                <Trash2 className="size-4 text-destructive hover:opacity-80" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="flex-1 text-xs"
            placeholder="سبب الخصم العام (مثال: عدم ارتداء الزي، تدخين، نظافة الفرع الخارجى)..."
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Input
            className="w-24 text-xs font-mono"
            type="number"
            min={0}
            max={100}
            placeholder="%"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
          />
          <Button variant="outline" size="sm" onClick={addGeneralDeduction}>
            إضافة خصم
          </Button>
        </div>
      </div>

      {/* أزرار الإجراءات السفلية: تم إزالة PDF/Word بالكامل */}
      <div className="mt-6 flex flex-wrap gap-2" dir="rtl">
        {isDraft && (
          <Button disabled={submitting} onClick={submitAudit} className="gap-2 font-bold">
            {submitting && <Loader2 className="size-4 animate-spin" />} اعتماد وإنهاء الفحص
          </Button>
        )}

        <Button
          onClick={() => exportAuditToExcel(id)}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          <FileSpreadsheet className="size-4" /> تصدير تقرير إكسيل (Excel)
        </Button>

        <Button asChild variant="ghost">
          <Link to="/audits/$id" params={{ id }}>
            الرجوع لقائمة الأسئلة
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-extrabold">{value}</div>
    </div>
  );
}
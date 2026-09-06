import { useState, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, History, Loader2, RotateCcw, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadReportModel } from "@/lib/report-data";
import { exportAuditToExcel } from "@/lib/export-audit-excel";
import { logAuditEdit } from "@/lib/generate-reports";
import { ReportDocument } from "@/components/report/ReportDocument";
import { downloadElementAsPdf } from "@/lib/export-pdf";

export const Route = createFileRoute("/_authenticated/audits/$id/report")({
  head: () => ({
    meta: [
      { title: "NCR Report — SBAS" },
      { name: "description", content: "Inspection report and NCR details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reportRef = useRef<HTMLDivElement>(null);

  const [reopening, setReopening] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // 1. جلب بيانات التقرير والـ NCRs
  const { data: model, isLoading } = useQuery({
    queryKey: ["audit-report", id],
    queryFn: () => loadReportModel(id),
  });

  // 2. جلب سجل التعديلات
  const { data: logs } = useQuery({
    queryKey: ["audit-logs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_edit_logs")
        .select("*")
        .eq("audit_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  if (isLoading || !model) {
    return (
      <AppShell title="جاري تجهيز تقرير الفحص">
        <p className="text-sm text-muted-foreground text-center py-10" dir="rtl">
          جاري استخراج بيانات عدم المطابقة والخصومات...
        </p>
      </AppShell>
    );
  }

  // تصدير الإكسيل المباشر
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      await exportAuditToExcel(id);
    } catch (err: any) {
      toast.error("تعذر استخراج ملف الإكسيل: " + (err?.message || ""));
    } finally {
      setExportingExcel(false);
    }
  };

  // تصدير الـ PDF عبر html2canvas المنظف
  const handleExportPdf = async () => {
    if (!reportRef.current) {
      toast.error("وثيقة التقرير غير جاهزة للتصدير");
      return;
    }
    try {
      setExportingPdf(true);
      toast.info("جاري تجهيز وتنسيق ملف الـ PDF...");
      const fileName = `تقرير_${model.branchName || "الفرع"}_${model.auditDate || "فحص"}`;
      await downloadElementAsPdf(reportRef.current, fileName);
      toast.success("تم تحميل تقرير الـ PDF بنجاح");
    } catch (err: any) {
      console.error("PDF Export Error:", err);
      toast.error("حدث خطأ أثناء تصدير الـ PDF: " + (err?.message || ""));
    } finally {
      setExportingPdf(false);
    }
  };

  // إعادة الفتح للتعديل
  const handleReopen = async () => {
    setReopening(true);
    const nextVersion = (model.version ?? 1) + 1;
    const { error } = await supabase
      .from("audits")
      .update({
        status: "draft",
        version: nextVersion,
        edited_at: new Date().toISOString(),
      } as never)
      .eq("id", id);

    setReopening(false);

    if (error) {
      toast.error("تعذر إعادة فتح الفحص للتعديل");
      return;
    }

    await logAuditEdit(id, "reopened", `Reopened for editing as version ${nextVersion}`);
    queryClient.invalidateQueries({ queryKey: ["audit-report", id] });
    toast.success(`تم فتح الفحص كمسودة جديدة الإصدار ${nextVersion}`);
    navigate({ to: "/audits/$id", params: { id } });
  };

  return (
    <AppShell
      title={`تقرير عدم المطابقة والخصومات — ${model.branchName}`}
      subtitle={`${model.auditTypeName} • ${model.auditDate} • الإصدار v${model.version}`}
      action={
        <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
          <Badge variant={model.status === "draft" ? "outline" : "default"}>
            {model.status === "draft" ? "مسودة" : "فحص معتمد"}
          </Badge>

          <Badge variant="destructive" className="flex items-center gap-1">
            {model.ncrs?.length ?? 0} عدم مطابقة
          </Badge>

          {/* زر تحميل PDF المباشر */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="gap-1.5 font-bold shadow-sm border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {exportingPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4 text-blue-600" />}
            {exportingPdf ? "جاري التجهيز..." : "تحميل PDF"}
          </Button>

          {/* زر تصدير الإكسيل */}
          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
          >
            {exportingExcel ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            تصدير تقرير إكسيل (Excel)
          </Button>

          {model.status === "submitted" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={reopening}
              onClick={handleReopen}
              className="gap-1.5"
            >
              {reopening ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              إعادة الفتح
            </Button>
          )}

          {model.status === "draft" && (
            <Button asChild variant="secondary" size="sm">
              <Link to="/audits/$id/summary" params={{ id }}>
                العودة للملخص
              </Link>
            </Button>
          )}
        </div>
      }
    >
      {/* وثيقة التقرير المربوطة بـ reportRef */}
      <div
        ref={reportRef}
        className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm"
      >
        <ReportDocument model={model} />
      </div>

      {/* سجل التعديلات */}
      <div className="surface-card mt-6 p-4 rounded-xl border border-border print:hidden" dir="rtl">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <History className="size-4 text-primary" />
          سجل التعديلات والتغييرات
        </h3>
        <div className="mt-3 space-y-1.5 text-xs">
          {(logs?.length ?? 0) === 0 && (
            <p className="text-muted-foreground">لا توجد تعديلات مسجلة.</p>
          )}
          {logs?.map((entry: any) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5 last:border-0"
            >
              <span className="font-semibold">{entry.action}</span>
              <span className="text-muted-foreground">{entry.detail}</span>
              <span className="mr-auto text-[11px] text-muted-foreground font-mono" dir="ltr">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
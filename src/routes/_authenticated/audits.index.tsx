import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, PenLine, Trash2, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { logAuditEdit } from "@/lib/generate-reports";
import { exportAuditToExcel } from "@/lib/export-audit-excel";
import { loadReportModel } from "@/lib/report-data";
import { downloadElementAsPdf } from "@/lib/export-pdf";
import { ReportDocument } from "@/components/report/ReportDocument";

const searchSchema = z.object({
  status: z.enum(["all", "draft", "submitted"]).default("all"),
});

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Audits — SBAS" },
      { name: "description", content: "Food safety audit history: drafts in progress and completed audits." },
      { property: "og:title", content: "Audits — SBAS" },
      { property: "og:description", content: "Seoudi branch audit records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsList,
});

function AuditsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"completed" | "drafts">("completed");
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  // 1. جلب المستخدم الحالي ودوره من جدول user_roles
  const { data: userProfile } = useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user;
      if (authErr || !user) return null;

      // الاستعلام عن الدور من جدول user_roles الفعلي
      const { data: roleRecord } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const userRole = (roleRecord?.role || "").toLowerCase();
      const isAdmin = userRole === "admin" || userRole === "manager";

      return { user, role: userRole, isAdmin };
    },
  });

  // 2. جلب الفحوصات مع الفلترة حسب الصلاحية
  const { data: audits, isLoading } = useQuery({
    queryKey: ["audits", userProfile?.user?.id, userProfile?.isAdmin],
    queryFn: async () => {
      let auditsQuery = supabase.from("audits").select("*").order("audit_date", { ascending: false });

      // لو مراجع فقط، نحصر النتائج على فحوصاته
      if (userProfile && !userProfile.isAdmin && userProfile.user?.id) {
        auditsQuery = auditsQuery.eq("auditor_id", userProfile.user.id);
      }

      const [auditsRes, branchesRes, typesRes] = await Promise.all([
        auditsQuery,
        supabase.from("branches").select("*"),
        supabase.from("audit_types").select("*"),
      ]);

      if (auditsRes.error) {
        console.error("Fetch audits error:", auditsRes.error);
        throw auditsRes.error;
      }

      const branchMap = new Map(
        (branchesRes.data || []).map((b: any) => [b.id, b.name_ar || b.name || "فرع غير محدد"])
      );
      const typeMap = new Map(
        (typesRes.data || []).map((t: any) => [t.id, t.name_ar || t.name || t.name_en || "سلامة الغذاء"])
      );

      const raw = auditsRes.data || [];

      return raw.map((audit: any) => ({
        ...audit,
        branchName: branchMap.get(audit.branch_id) || "فرع غير محدد",
        typeName: typeMap.get(audit.audit_type_id) || "سلامة الغذاء",
      }));
    },
    enabled: userProfile !== undefined,
  });

  const reopen = async (auditId: string, version: number) => {
    const nextVersion = (version ?? 1) + 1;
    const { error } = await supabase
      .from("audits")
      .update({ status: "draft", version: nextVersion, edited_at: new Date().toISOString() } as never)
      .eq("id", auditId);

    if (error) {
      toast.error("تعذر إعادة فتح الفحص للتعديل");
      return;
    }
    await logAuditEdit(auditId, "reopened", `Reopened for editing as version ${nextVersion}`);
    queryClient.invalidateQueries({ queryKey: ["audits"] });
    navigate({ to: "/audits/$id", params: { id: auditId } });
  };

  const exportAuditPdf = async (auditId: string) => {
    try {
      setExportingPdfId(auditId);
      const model = await loadReportModel(auditId);
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-100000px";
      container.style.top = "0";
      container.style.width = "900px";
      container.style.background = "white";
      document.body.appendChild(container);
      const root = document.createElement("div");
      container.appendChild(root);
      const { createRoot } = await import("react-dom/client");
      const reportRoot = createRoot(root);
      reportRoot.render(<ReportDocument model={model} />);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await downloadElementAsPdf(root, `تقرير_${model.branchName || "الفرع"}_${model.auditDate || "فحص"}`);
      reportRoot.unmount();
      container.remove();
      toast.success("تم تحميل تقرير الـ PDF بنجاح");
    } catch (error) {
      console.error("PDF export error", error);
      toast.error("تعذر تصدير تقرير الـ PDF");
    } finally {
      setExportingPdfId(null);
    }
  };

  const removeAudit = async (auditId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الفحص بالكامل؟")) return;
    const { error } = await supabase.from("audits").delete().eq("id", auditId);
    if (error) {
      toast.error("تعذر حذف الفحص");
      return;
    }
    toast.success("تم حذف الفحص بنجاح");
    queryClient.invalidateQueries({ queryKey: ["audits"] });
  };

  const completedAudits = (audits || []).filter(
    (a) => a.status === "submitted" || a.status === "approved"
  );
  const draftAudits = (audits || []).filter(
    (a) => a.status === "draft" || a.status === "in_progress"
  );

  const renderAuditCard = (audit: any, isDraft: boolean) => (
    <div key={audit.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-40" dir="rtl">
        <div className="text-base font-bold text-foreground">{audit.branchName}</div>
        <div className="text-xs text-muted-foreground">
          {audit.typeName} · <span dir="ltr">{audit.audit_date}</span>
        </div>
      </div>

      <Badge variant={isDraft ? "outline" : "default"}>
        {isDraft ? "مسودة (Draft)" : "معتمد (Completed)"}
      </Badge>

      {(audit.version ?? 1) > 1 && (
        <span className="text-xs text-muted-foreground font-mono">v{audit.version}</span>
      )}

      <div className="ml-auto flex flex-wrap gap-2">
        {isDraft ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/audits/$id" params={{ id: audit.id }}>
              <PenLine className="size-4 ml-1" /> استكمال
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => reopen(audit.id, audit.version ?? 1)}>
            <PenLine className="size-4 ml-1" /> إعادة فتح للتعديل
          </Button>
        )}

        <Button asChild size="sm" variant="outline">
          <Link to="/audits/$id/summary" params={{ id: audit.id }}>
            الملخص
          </Link>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => exportAuditToExcel(audit.id)}
          className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 font-semibold"
        >
          <FileSpreadsheet className="size-4 ml-1 text-emerald-600" /> إكسيل (Excel)
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void exportAuditPdf(audit.id)}
          disabled={exportingPdfId === audit.id}
          className="border-blue-300 font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
        >
          <FileDown className="size-4 ml-1 text-blue-600" />
          {exportingPdfId === audit.id ? "جاري التجهيز..." : "PDF"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete audit"
          onClick={() => removeAudit(audit.id)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );

  return (
    <AppShell
      title="Audits"
      subtitle={
        userProfile?.isAdmin
          ? "سجل الفحوصات والزيارات المسجلة لجميع الفروع"
          : "سجل الفحوصات والزيارات الخاصة بك"
      }
      action={
        <Button asChild>
          <Link to="/audits/new">فحص جديد (New audit)</Link>
        </Button>
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "completed" | "drafts")}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md h-11 p-1 bg-muted rounded-lg" dir="rtl">
          <TabsTrigger
            value="completed"
            className="gap-2 text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <CheckCircle2 className="size-4 text-emerald-600" />
            الفحوصات المكتملة
            <Badge variant="secondary" className="mr-1 text-xs">
              {completedAudits.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger
            value="drafts"
            className="gap-2 text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Clock className="size-4 text-amber-500" />
            المسودات قيد التنفيذ
            <Badge variant="secondary" className="mr-1 text-xs">
              {draftAudits.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">جاري تحميل سجل الفحوصات…</p>
        )}

        <TabsContent value="completed" className="space-y-3 mt-0">
          {!isLoading && completedAudits.length === 0 && (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground" dir="rtl">
              لا توجد فحوصات مكتملة مسجلة حالياً.
            </div>
          )}
          <div className="grid gap-3">
            {completedAudits.map((audit) => renderAuditCard(audit, false))}
          </div>
        </TabsContent>

        <TabsContent value="drafts" className="space-y-3 mt-0">
          {!isLoading && draftAudits.length === 0 && (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground" dir="rtl">
              لا توجد أي مسودات معلقة حالياً.
            </div>
          )}
          <div className="grid gap-3">
            {draftAudits.map((audit) => renderAuditCard(audit, true))}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

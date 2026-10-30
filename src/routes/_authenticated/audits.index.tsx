import { AuditEmailButton } from "@/components/audit/AuditEmailButton";
import { auditOwnerFilter } from "@/lib/audit-sharing";
import { useAuditSharing } from "@/hooks/useAuditSharing";
import { auditReportFileBase } from "@/lib/audit-report-name";
import { invalidateDashboard } from "@/lib/dashboard/cache";
import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { matchesLocationScope, locationScopeLabel, type LocationScope } from "@/lib/location-scope";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, PenLine, Trash2, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportAuditToExcel } from "@/lib/export-audit-excel";
import { loadReportModel } from "@/lib/report-data";
import { downloadElementAsPdf } from "@/lib/export-pdf";
import { ReportDocument } from "@/components/report/ReportDocument";
import { useSession } from "@/hooks/useSession";
import {
  canReadAudit,
  canEditAudit,
  canViewAllAudits,
  canViewDraftAudits,
} from "@/lib/permissions";

const searchSchema = z.object({
  status: z.enum(["all", "draft", "submitted"]).default("all"),
  type: z.string().default("all"),
  scope: z.enum(["branches", "warehouses"]).default("branches"),
});

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Audits — SQOP" },
      {
        name: "description",
        content: "Food safety audit history: drafts in progress and completed audits.",
      },
      { property: "og:title", content: "Audits — SQOP" },
      { property: "og:description", content: "Seoudi branch audit records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsList,
});

function AuditsList() {
  const navigate = useNavigate();
  const { status, type, scope } = useSearch({ from: "/_authenticated/audits/" });
  const queryClient = useQueryClient();
  const { profile } = useSession();
  const sharing = useAuditSharing();
  const showDrafts = !!profile && canViewDraftAudits(profile.role);
  const [activeTab, setActiveTab] = useState<"completed" | "drafts">("completed");
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const [exportingExcelId, setExportingExcelId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pdfLock = useRef(false);
  const excelLock = useRef(false);
  const deleteLock = useRef(false);
  const [monthFrom, setMonthFrom] = useState(() => {
    const enteredAt = new Date();
    return `${enteredAt.getFullYear()}-${String(enteredAt.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthTo, setMonthTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  // Use the verified session role; do not reuse an independently cached role after an account change.
  const userProfile = profile
    ? { user: { id: profile.id }, role: profile.role, isAdmin: profile.role === "admin" }
    : null;

  // 2. جلب الفحوصات مع الفلترة حسب الصلاحية
  const { data: audits, isLoading } = useQuery({
    queryKey: [
      "audits",
      userProfile?.user?.id,
      userProfile?.role,
      sharing.peerIds,
      sharing.visibleBranchIds,
    ],
    queryFn: async () => {
      let auditsQuery = supabase
        .from("audits")
        .select("*")
        .order("audit_date", { ascending: false })
        .order("id");

      if (userProfile && userProfile.role !== "admin")
        auditsQuery = auditsQuery.or(
          auditOwnerFilter(
            userProfile.user.id,
            sharing.peerIds,
            userProfile.role === "manager",
            sharing.visibleBranchIds,
          ),
        );

      const [auditsRes, branchesRes, typesRes, profilesRes] = await Promise.all([
        (async () => {
          const rows: any[] = [];
          for (let offset = 0; ; offset += 500) {
            const result = await auditsQuery.range(offset, offset + 499);
            if (result.error) throw result.error;
            rows.push(...(result.data ?? []));
            if ((result.data?.length ?? 0) < 500) break;
          }
          return { data: [...new Map(rows.map((row) => [row.id, row])).values()], error: null };
        })(),
        supabase.from("branches").select("*"),
        supabase.from("audit_types").select("*"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      if (auditsRes.error) {
        console.error("Fetch audits error:", auditsRes.error);
        throw auditsRes.error;
      }

      const branchMap = new Map(
        (branchesRes.data || []).map((b: any) => [b.id, b.name_ar || b.name || "فرع غير محدد"]),
      );
      const typeMap = new Map(
        (typesRes.data || []).map((t: any) => [
          t.id,
          t.name_ar || t.name || t.name_en || "سلامة الغذاء",
        ]),
      );
      const profileMap = new Map(
        (profilesRes.data || []).map((profile: any) => [
          profile.id,
          profile.full_name || profile.email || "مراجع غير محدد",
        ]),
      );

      const raw = auditsRes.data || [];

      return raw.map((audit: any) => ({
        ...audit,
        branchName: branchMap.get(audit.branch_id) || "فرع غير محدد",
        typeName: typeMap.get(audit.audit_type_id) || "سلامة الغذاء",
        typeId: audit.audit_type_id,
        auditorName: profileMap.get(audit.auditor_id) || "مراجع غير محدد",
      }));
    },
    enabled: !!userProfile?.user?.id && sharing.isSuccess,
  });

  const exportAuditPdf = async (auditId: string) => {
    if (pdfLock.current) return;
    pdfLock.current = true;
    let container: HTMLDivElement | undefined;
    let reportRoot: import("react-dom/client").Root | undefined;
    try {
      setExportingPdfId(auditId);
      const model = await loadReportModel(auditId);
      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-100000px";
      container.style.top = "0";
      container.style.width = "900px";
      container.style.background = "white";
      document.body.appendChild(container);
      const root = document.createElement("div");
      container.appendChild(root);
      const { createRoot } = await import("react-dom/client");
      reportRoot = createRoot(root);
      reportRoot.render(<ReportDocument model={model} />);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await downloadElementAsPdf(root, auditReportFileBase(model));
      toast.success("تم تحميل تقرير الـ PDF بنجاح");
    } catch (error) {
      console.error("PDF export error", error);
      toast.error("تعذر تصدير تقرير الـ PDF");
    } finally {
      reportRoot?.unmount();
      container?.remove();
      pdfLock.current = false;
      setExportingPdfId(null);
    }
  };

  const exportExcel = async (auditId: string) => {
    if (excelLock.current) return;
    excelLock.current = true;
    setExportingExcelId(auditId);
    try {
      await exportAuditToExcel(auditId);
    } catch {
      toast.error("تعذر تصدير تقرير الإكسيل؛ أعد المحاولة");
    } finally {
      excelLock.current = false;
      setExportingExcelId(null);
    }
  };

  const removeAudit = async (auditId: string) => {
    if (deleteLock.current || !confirm("هل أنت متأكد من حذف هذا الفحص بالكامل؟")) return;
    deleteLock.current = true;
    setDeletingId(auditId);
    try {
      const { data, error } = await supabase
        .from("audits")
        .delete()
        .eq("id", auditId)
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("لم يتم تأكيد الحذف");
      toast.success("تم حذف الفحص بنجاح");
      void queryClient.invalidateQueries({ queryKey: ["audits"] });
      void invalidateDashboard(queryClient);
    } catch {
      toast.error("تعذر حذف الفحص؛ أعد المحاولة");
    } finally {
      deleteLock.current = false;
      setDeletingId(null);
    }
  };

  const scopedAudits = useMemo(
    () =>
      (audits || []).filter((audit) => {
        if (
          !profile ||
          sharing.isError ||
          !canReadAudit({
            role: profile.role,
            userId: profile.id,
            createdBy: audit.created_by,
            auditorId: audit.auditor_id,
            status: audit.status,
            sharedUserIds: sharing.peerIds,
            branchId: audit.branch_id,
            managerBranchIds: sharing.visibleBranchIds,
          })
        )
          return false;
        const branch = { name_ar: audit.branchName };
        const statusMatches =
          !showDrafts ||
          status === "all" ||
          (status === "submitted"
            ? audit.status === "submitted" || audit.status === "approved"
            : audit.status === "draft" || audit.status === "in_progress");
        return (
          matchesLocationScope(branch, scope as LocationScope) &&
          statusMatches &&
          (type === "all" || audit.typeId === type) &&
          (branchFilter === "all" || audit.branch_id === branchFilter) &&
          (!monthFrom || audit.audit_date?.slice(0, 7) >= monthFrom) &&
          (!monthTo || audit.audit_date?.slice(0, 7) <= monthTo)
        );
      }),
    [
      audits,
      scope,
      status,
      type,
      branchFilter,
      monthFrom,
      monthTo,
      showDrafts,
      profile,
      sharing.peerIds,
      sharing.visibleBranchIds,
      sharing.isError,
    ],
  );

  const completedAudits = scopedAudits.filter(
    (a) => a.status === "submitted" || a.status === "approved",
  );
  const draftAudits = scopedAudits.filter(
    (a) => a.status === "draft" || a.status === "in_progress",
  );

  const renderAuditCard = (audit: any, isDraft: boolean) => {
    const canEdit = profile
      ? canEditAudit({
          sharedUserIds: sharing.peerIds,
          role: profile.role,
          userId: profile.id,
          createdBy: audit.created_by,
          auditorId: audit.auditor_id,
          status: audit.status,
        })
      : false;

    return (
      <div key={audit.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-40" dir="rtl">
          <div className="text-base font-bold text-foreground">{audit.branchName}</div>
          <div className="text-xs text-muted-foreground">
            {audit.typeName} · <span dir="ltr">{audit.audit_date}</span>
          </div>
          <div className="mt-1 text-xs font-medium text-primary">المراجع: {audit.auditorName}</div>
          <div className="mt-1 text-xs text-muted-foreground" dir="ltr">
            ID: {audit.id.slice(0, 8)}
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
            canEdit ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/audits/$id" params={{ id: audit.id }}>
                  <PenLine className="size-4 ml-1" /> استكمال
                </Link>
              </Button>
            ) : null
          ) : canEdit ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/audits/$id" params={{ id: audit.id }}>
                <PenLine className="size-4 ml-1" /> تعديل
              </Link>
            </Button>
          ) : null}

          {audit.status === "submitted" && <AuditEmailButton auditId={audit.id} />}
          <Button asChild size="sm" variant="outline">
            <Link to="/audits/$id/summary" params={{ id: audit.id }}>
              الملخص
            </Link>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void exportExcel(audit.id)}
            disabled={exportingExcelId !== null}
            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 font-semibold"
          >
            <FileSpreadsheet className="size-4 ml-1 text-emerald-600" /> إكسيل (Excel)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void exportAuditPdf(audit.id)}
            disabled={exportingPdfId !== null}
            className="border-blue-300 font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          >
            <FileDown className="size-4 ml-1 text-blue-600" />
            {exportingPdfId === audit.id ? "جاري التجهيز..." : "PDF"}
          </Button>

          {profile &&
            (profile.role === "admin" ||
              audit.created_by === profile.id ||
              audit.auditor_id === profile.id) && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="حذف الفحص"
                disabled={deletingId !== null}
                onClick={() => removeAudit(audit.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
        </div>
      </div>
    );
  };

  return (
    <AppShell
      contentClassName="audit-list-page"
      title="Audits"
      subtitle={
        canViewAllAudits((userProfile?.role || "auditor") as "admin" | "manager" | "auditor")
          ? "سجل الفحوصات والزيارات المسجلة لجميع الفروع — عرض فقط"
          : "سجل الفحوصات والزيارات الخاصة بك"
      }
      action={
        <Button asChild>
          <Link to="/audits/new">فحص جديد (New audit)</Link>
        </Button>
      }
    >
      {sharing.isError && (
        <p role="alert">
          تعذر تحميل صلاحيات المشاركة.{" "}
          <Button onClick={() => void sharing.refetch()}>إعادة المحاولة</Button>
        </p>
      )}
      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-4" dir="rtl">
        <span className="text-sm font-semibold">
          تصفية {locationScopeLabel(scope as LocationScope)}:
        </span>
        <Select
          value={scope}
          onValueChange={(value) =>
            navigate({
              to: "/audits",
              search: (prev) => ({ ...prev, scope: value as "branches" | "warehouses" }),
            })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="الموقع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="branches">الفروع</SelectItem>
            <SelectItem value="warehouses">المخازن</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={type}
          onValueChange={(value) =>
            navigate({ to: "/audits", search: (prev) => ({ ...prev, type: value }) })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="نوع التدقيق" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أنواع التدقيق</SelectItem>
            {Array.from(
              new Map((audits || []).map((audit) => [audit.typeId, audit.typeName])).entries(),
            )
              .filter(([id]) => id)
              .map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="اسم الفرع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {Array.from(
              new Map((audits || []).map((audit) => [audit.branch_id, audit.branchName])).entries(),
            )
              .filter(([id]) => id)
              .map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">من شهر</span>
          <input
            type="month"
            value={monthFrom}
            onChange={(event) => setMonthFrom(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="من شهر"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">إلى شهر</span>
          <input
            type="month"
            value={monthTo}
            onChange={(event) => setMonthTo(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="إلى شهر"
          />
        </label>
        <Select
          value={showDrafts ? status : "submitted"}
          disabled={!showDrafts}
          onValueChange={(value) =>
            navigate({
              to: "/audits",
              search: (prev) => ({ ...prev, status: value as "all" | "draft" | "submitted" }),
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="submitted">مكتمل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs
        value={showDrafts ? activeTab : "completed"}
        onValueChange={(val) => setActiveTab(val as "completed" | "drafts")}
        className="w-full space-y-4"
      >
        <TabsList
          className="grid w-full grid-cols-2 max-w-md h-11 p-1 bg-muted rounded-lg"
          dir="rtl"
        >
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
            disabled={!showDrafts}
            value="drafts"
            className="gap-2 text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Clock className="size-4 text-amber-500" />
            {profile?.role === "manager"
              ? sharing.peerIds.length
                ? "مسوداتي والمشاركة معي"
                : "مسوداتي قيد التنفيذ"
              : "المسودات قيد التنفيذ"}
            <Badge variant="secondary" className="mr-1 text-xs">
              {showDrafts ? draftAudits.length : "مغلق"}
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

        {showDrafts && (
          <TabsContent value="drafts" className="space-y-3 mt-0">
            {!isLoading && draftAudits.length === 0 && (
              <div
                className="surface-card p-10 text-center text-sm text-muted-foreground"
                dir="rtl"
              >
                لا توجد أي مسودات معلقة حالياً.
              </div>
            )}
            <div className="grid gap-3">
              {draftAudits.map((audit) => renderAuditCard(audit, true))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}

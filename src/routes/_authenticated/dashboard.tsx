import { useAuditSharing } from "@/hooks/useAuditSharing";
import { dashboardMonthInterval, trackingIntervalMonths } from "@/lib/dashboard/month-interval";
import { toast } from "sonner";
import { buildTrackingRows, mergeTrackingAudits } from "@/lib/dashboard/tracking-model";
import { fetchMonthlyTracking, updateMonthlyTracking } from "@/lib/dashboard/tracking";
import { buildDashboardDetails, buildBranchProgramsTree } from "@/lib/dashboard/detail-model";
import { currentMonthBounds } from "@/lib/dashboard/dates";
import { MonthlyTrackingCard, type TrackingRow } from "@/components/dashboard/MonthlyTrackingCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { useState, useMemo, useRef, useEffect } from "react";
import { z } from "zod";
import { type LocationScope } from "@/lib/location-scope";
import { dashboardSnapshotOptions, dashboardDetailOptions } from "@/lib/dashboard/queries";
import {
  aggregateDashboard,
  dashboardErrorMessage,
  dashboardMonthRange,
} from "@/lib/dashboard/snapshot";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { DashboardRanking } from "@/components/DashboardRanking";
import { DashboardScoreDetails } from "@/components/DashboardScoreDetails";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  FilePlus2,
  FileCheck2,
  MessageSquare,
  Store,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronDown,
  X,
  FileSpreadsheet,
  Printer,
  Layers,
  ExternalLink,
  ShieldAlert,
  FileText,
  Circle,
  Clock3,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const dashboardSearchSchema = z.object({
  scope: z.enum(["branches", "warehouses"]).default("branches"),
  tab: z.enum(["overview", "tracking"]).default("overview"),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: dashboardSearchSchema,
  head: () => ({
    meta: [
      { title: "Bird Eye — SQOP" },
      { name: "description", content: "Executive Food Safety Quality Dashboard." },
      { property: "og:title", content: "لوحة التحكم والتحليلات — SQOP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardGate,
});

function DashboardGate() {
  const { profile, isLoading } = useSession();
  if (isLoading)
    return (
      <AppShell title="لوحة التحكم">
        <p>جاري التحقق من الحساب…</p>
      </AppShell>
    );
  if (!profile?.active || !["admin", "manager"].includes(profile.role)) {
    return (
      <AppShell title="لوحة التحكم">
        <p dir="rtl">لوحة التحكم متاحة للإدارة والمشرفين فقط.</p>
        <Link to="/audits">سجل فحوصاتي</Link>
      </AppShell>
    );
  }
  return <ExecutiveDashboard />;
}

function ExecutiveDashboard() {
  const { profile, isAdmin } = useSession();
  const sharing = useAuditSharing();
  const branchAccessReady = profile?.role === "admin" || sharing.isSuccess;
  const allowedBranchIds = profile?.role === "manager" ? sharing.visibleBranchIds : null;
  const showDrafts = profile?.role !== "manager";
  const canViewAll = profile?.role === "admin" || profile?.role === "manager";
  const { scope, tab } = useSearch({ from: "/_authenticated/dashboard" });

  const [exportingExcel, setExportingExcel] = useState(false);
  const exportLock = useRef(false);
  const [fromMonth, setFromMonth] = useState(() => currentMonthBounds().start.slice(0, 7));
  const [toMonth, setToMonth] = useState(() => currentMonthBounds().start.slice(0, 7));
  const [automaticPeriod, setAutomaticPeriod] = useState(true);
  const resetPeriod = () => {
    const month = currentMonthBounds().start.slice(0, 7);
    setFromMonth(month);
    setToMonth(month);
    setAutomaticPeriod(true);
  };
  useEffect(() => {
    if (!automaticPeriod) return;
    const updateCurrentMonth = () => {
      const month = currentMonthBounds().start.slice(0, 7);
      setFromMonth((previous) => (previous === month ? previous : month));
      setToMonth((previous) => (previous === month ? previous : month));
    };
    updateCurrentMonth();
    const timer = window.setInterval(updateCurrentMonth, 60_000);
    window.addEventListener("focus", updateCurrentMonth);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateCurrentMonth);
    };
  }, [automaticPeriod]);
  const [programFilter, setProgramFilter] = useState<"all" | "FS" | "GHP" | "FSMS">("all");
  const {
    start: startDate,
    end: endDate,
    valid: dateRangeValid,
  } = dashboardMonthInterval(fromMonth, toMonth);
  const [branchFilter, setBranchFilter] = useState("all");

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<
    "compliance" | "visits" | "nonCompliance" | "critical" | null
  >(null);
  const [issueBranchFilter, setIssueBranchFilter] = useState("all");
  const [issueProgramFilter, setIssueProgramFilter] = useState("all");
  const [issueMonthFilter, setIssueMonthFilter] = useState("");

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const snapshotFilters = useMemo(
    () => ({
      scope: scope as LocationScope,
      start: startDate,
      end: endDate,
      branch: branchFilter,
      program: programFilter,
      submittedOnly: !showDrafts,
      allowedBranchIds,
    }),
    [scope, startDate, endDate, branchFilter, programFilter, showDrafts, allowedBranchIds],
  );
  const trackingMonths = useMemo(
    () => trackingIntervalMonths(fromMonth, toMonth, currentMonthBounds().start.slice(0, 7)),
    [fromMonth, toMonth],
  );
  const trackingRange = {
    start: trackingMonths.length ? `${trackingMonths[0]}-01` : "",
    end: trackingMonths.length
      ? dashboardMonthRange(trackingMonths[trackingMonths.length - 1]!).end
      : "",
  };
  const snapshotQuery = useQuery({
    ...dashboardSnapshotOptions(profile?.id, snapshotFilters),
    enabled: canViewAll && branchAccessReady && tab === "overview" && dateRangeValid,
  });
  const summary = useMemo(
    () => (snapshotQuery.data ? aggregateDashboard(snapshotQuery.data, snapshotFilters) : null),
    [snapshotQuery.data, snapshotFilters],
  );
  const {
    data,
    isPending: isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...dashboardDetailOptions(
      profile?.id,
      scope as LocationScope,
      tab,
      tab === "tracking"
        ? {
            ...trackingRange,
            branch: "all",
            includeAnswers: false,
            allowedBranchIds,
            submittedOnly: !showDrafts,
          }
        : {
            start: startDate,
            end: endDate,
            branch: branchFilter,
            program: programFilter,
            submittedOnly: !showDrafts,
            allowedBranchIds,
          },
    ),
    enabled: canViewAll && branchAccessReady && dateRangeValid,
    refetchOnWindowFocus: tab === "tracking",
  });
  const refreshDashboard = () =>
    tab === "tracking"
      ? Promise.all([trackingQuery.refetch(), refetch()])
      : Promise.all([snapshotQuery.refetch(), refetch()]);
  const summaryCount = (value: number | undefined) =>
    snapshotQuery.isError || !dateRangeValid
      ? "—"
      : snapshotQuery.isPending || value === undefined
        ? "…"
        : value;

  const dashboardFilterProps = {
    locations: snapshotQuery.data?.locations ?? data?.branches ?? [],
    branch: branchFilter,
    fromMonth,
    toMonth,
    program: programFilter,
    onBranch: setBranchFilter,
    onFromMonth: (value: string) => {
      setAutomaticPeriod(false);
      setFromMonth(value);
    },
    onToMonth: (value: string) => {
      setAutomaticPeriod(false);
      setToMonth(value);
    },
    onResetPeriod: resetPeriod,
    onProgram: setProgramFilter,
  };

  const trackingQuery = useQuery({
    queryKey: ["monthly-branch-tracking", profile?.id, scope, trackingMonths],
    queryFn: ({ signal }) =>
      Promise.all(
        trackingMonths.map(async (month) => ({
          month: `${month}-01`,
          rows: await fetchMonthlyTracking(`${month}-01`, signal),
        })),
      ),
    enabled: canViewAll && branchAccessReady && tab === "tracking" && dateRangeValid,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const trackingGroups = useMemo(
    () =>
      trackingMonths.map((month) => ({
        month: `${month}-01`,
        rows: mergeTrackingAudits(
          buildTrackingRows(
            data?.branches ?? [],
            trackingQuery.data?.find((group) => group.month === `${month}-01`)?.rows ?? [],
            `${month}-01`,
          ),
          data?.audits ?? [],
          `${month}-01`,
        ),
      })),
    [data, trackingQuery.data, trackingMonths],
  );
  const [trackingPendingKey, setTrackingPendingKey] = useState<string | null>(null);
  const trackingWrite = useRef(false);
  const updateTracking = async (
    trackingMonth: string,
    id: string,
    field: "fs_status" | "ghp_status" | "fsms_status",
    value: string,
  ) => {
    if (!isAdmin || trackingWrite.current) return;
    const row = trackingGroups
      .find((group) => group.month === trackingMonth)
      ?.rows.find((row) => row.id === id);
    if (!row) return;
    trackingWrite.current = true;
    setTrackingPendingKey(`${trackingMonth}:${id}:${field}`);
    try {
      await updateMonthlyTracking(row, field, value, trackingMonth);
      await trackingQuery.refetch({ throwOnError: true });
      toast.success("تم حفظ حالة المتابعة");
    } catch (error) {
      toast.error(`تعذر تحديث المتابعة: ${dashboardErrorMessage(error)}`);
    } finally {
      trackingWrite.current = false;
      setTrackingPendingKey(null);
    }
  };

  const filteredData = useMemo(
    () =>
      buildDashboardDetails({
        data,
        profile,
        snapshot: snapshotQuery.data,
        canViewAll,
        startDate,
        endDate,
        branchFilter,
      }),
    [data, profile, canViewAll, startDate, endDate, branchFilter, snapshotQuery.data],
  );

  const activeSection = useMemo(() => {
    if (!activeSectionId || !filteredData) return null;
    return filteredData.allSections.find((s) => s.id === activeSectionId) || null;
  }, [activeSectionId, filteredData]);

  const activeBranch = useMemo(() => {
    if (!selectedBranchId || !filteredData) return null;
    return filteredData.branchesSummary.find((b) => b.id === selectedBranchId) || null;
  }, [selectedBranchId, filteredData]);

  const activeIssues = useMemo(() => {
    const records = filteredData?.issueRecords ?? [];
    return records.filter(
      (issue) =>
        (issueBranchFilter === "all" || issue.branchId === issueBranchFilter) &&
        (issueProgramFilter === "all" || issue.program === issueProgramFilter) &&
        (!issueMonthFilter || issue.monthKey === issueMonthFilter),
    );
  }, [filteredData, issueBranchFilter, issueProgramFilter, issueMonthFilter]);

  const branchProgramsTree = useMemo(
    () => buildBranchProgramsTree(activeBranch, filteredData, data, snapshotQuery.data),
    [activeBranch, filteredData, data, snapshotQuery.data],
  );

  const displayedBranches = filteredData?.branchesSummary ?? [];

  const exportToExcel = async () => {
    if (exportLock.current) return;
    if (!filteredData || !data || !summary) {
      toast.error("انتظر اكتمال تحميل بيانات التقرير قبل التصدير");
      return;
    }
    exportLock.current = true;
    setExportingExcel(true);
    try {
      const { downloadDashboardWorkbook, loadDashboardDeductions } =
        await import("@/lib/dashboard/download");
      const deductions = await loadDashboardDeductions(
        filteredData.audits.map((audit) => audit.id),
      );
      downloadDashboardWorkbook(
        { data, filteredData, summary, ...deductions, scope: scope as LocationScope },
        `${scope === "warehouses" ? "Warehouses" : "Branches"}_Quality_Dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("تم تجهيز ملف التجميعة للتنزيل");
    } catch (error) {
      toast.error(
        `تعذر تصدير التجميعة: ${error instanceof Error ? error.message : "تحقق من الاتصال وأعد المحاولة"}`,
      );
    } finally {
      exportLock.current = false;
      setExportingExcel(false);
    }
  };

  return (
    <AppShell
      title={`لوحة المتابعة والتحليلات — ${profile?.full_name || "إدارة الجودة"}`}
      subtitle={
        canViewAll
          ? "متابعة دقيقة لنسب الامتثال وملاحظات الفروع والأقسام بالشهور"
          : "الملخص العام ومؤشرات الأداء"
      }
    >
      {profile?.role === "manager" && sharing.isError && (
        <p role="alert">
          تعذر تحميل صلاحيات الفروع.{" "}
          <Button onClick={() => void sharing.refetch()}>إعادة المحاولة</Button>
        </p>
      )}
      <div className="dashboard-filter-panel surface-card mb-5 rounded-xl border p-5 sm:p-6 print:hidden">
        <h2 className="mb-3 text-sm font-bold" dir="rtl">
          فلترة الفترة الزمنية
        </h2>
        <DashboardFilterBar {...dashboardFilterProps} />
      </div>

      <div className="dashboard-actions grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <Button
          asChild
          size="sm"
          className="h-auto py-2.5 flex justify-between bg-primary text-primary-foreground shadow-sm rounded-lg"
        >
          <Link to="/audits/new">
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <FilePlus2 className="size-4" /> بدء فحص جديد
            </span>
            <span className="text-[11px] opacity-80">تسجيل</span>
          </Link>
        </Button>
        {(showDrafts || profile?.role === "manager") && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-auto py-2.5 flex justify-between border-border rounded-lg bg-card"
          >
            <Link to="/audits" search={{ status: "draft" as const }}>
              <span className="font-bold flex items-center gap-1.5 text-xs">
                <ClipboardList className="size-4 text-amber-600" />{" "}
                {profile?.role === "manager" ? "مسوداتي" : "مسودات المتابعة"}
              </span>
              {showDrafts && (
                <Badge variant="secondary" className="text-xs px-2 py-0">
                  {summaryCount(summary?.draftsCount)}
                </Badge>
              )}
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={exportToExcel}
          disabled={
            !dateRangeValid ||
            exportingExcel ||
            !data ||
            !summary ||
            isLoading ||
            isError ||
            snapshotQuery.isFetching ||
            tab !== "overview"
          }
          className="h-auto py-2.5 flex justify-between border-border rounded-lg bg-card"
        >
          <span className="font-bold flex items-center gap-1.5 text-xs">
            <FileSpreadsheet className="size-4 text-emerald-600" />{" "}
            {exportingExcel ? "جاري تجهيز التجميعة…" : "تصدير Excel"}
          </span>
          <span className="text-[11px] text-muted-foreground">تحميل</span>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-auto py-2.5 flex justify-between border-border rounded-lg bg-card"
        >
          <Link to="/audits" search={{ status: "submitted" as const }}>
            <span className="font-bold flex items-center gap-1.5 text-xs">
              <FileCheck2 className="size-4 text-emerald-600" /> الفحوصات المعتمدة
            </span>
            <Badge variant="secondary" className="text-xs px-2 py-0">
              {summaryCount(summary?.submittedCount)}
            </Badge>
          </Link>
        </Button>
      </div>

      <div className="dashboard-tabs mb-6 mt-5 flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild size="sm" variant={tab === "overview" ? "default" : "ghost"}>
          <Link to="/dashboard" search={{ scope, tab: "overview" }}>
            نظرة عامة
          </Link>
        </Button>
        {canViewAll && (
          <Button asChild size="sm" variant={tab === "tracking" ? "default" : "ghost"}>
            <Link to="/dashboard" search={{ scope, tab: "tracking" }}>
              المتابعة الشهرية
            </Link>
          </Button>
        )}
      </div>

      {canViewAll && tab === "tracking" && dateRangeValid ? (
        <div className="space-y-6">
          {!fromMonth && !toMonth && (
            <p className="text-sm text-muted-foreground">
              المتابعة الشهرية تعرض الشهر الحالي عند مسح الفترة.
            </p>
          )}
          {trackingGroups.map((group) => (
            <MonthlyTrackingCard
              key={group.month}
              rows={group.rows.filter(
                (row) => branchFilter === "all" || row.branch_id === branchFilter,
              )}
              month={group.month}
              program={programFilter}
              loading={isLoading || trackingQuery.isPending}
              error={
                isError
                  ? dashboardErrorMessage(error)
                  : trackingQuery.isError
                    ? dashboardErrorMessage(trackingQuery.error)
                    : null
              }
              onRetry={() => void refreshDashboard()}
              pendingKey={
                trackingPendingKey?.startsWith(`${group.month}:`)
                  ? trackingPendingKey.slice(group.month.length + 1)
                  : null
              }
              onUpdate={(id, field, value) => updateTracking(group.month, id, field, value)}
              canEdit={isAdmin}
            />
          ))}
        </div>
      ) : null}

      {!dateRangeValid && (
        <p className="mt-4 text-sm text-destructive" dir="rtl">
          اختر شهر البداية وشهر النهاية، على أن تكون النهاية بعد البداية أو في نفس الشهر.
        </p>
      )}
      {tab === "overview" && snapshotQuery.isError && (
        <div className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm" dir="rtl">
          <p>تعذر تحميل ملخص الداشبورد. أعد المحاولة أو تواصل مع مسؤول النظام.</p>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">عرض تفاصيل الخطأ للدعم</summary>
            <pre
              dir="ltr"
              className="mt-2 whitespace-pre-wrap break-words rounded border p-3 text-left select-text"
            >
              {dashboardErrorMessage(snapshotQuery.error)}
            </pre>
          </details>
          <Button className="mt-2" size="sm" onClick={() => void refreshDashboard()}>
            إعادة المحاولة
          </Button>
        </div>
      )}
      {summary?.provisional && tab === "overview" && (
        <p className="mt-4 text-xs text-muted-foreground" dir="rtl">
          مؤشر مبدئي من الفحوصات المتاحة. اضغط على الامتثال لتصفية التفاصيل ومعرفة الأوديتس التي لم
          تُسجل.
        </p>
      )}
      {!!summary?.unknownPrograms.length && (
        <p className="mt-3 text-xs text-destructive" dir="rtl">
          أوديتس تحتاج تعريفًا قبل احتسابها: {summary.unknownPrograms.join("، ")}
        </p>
      )}

      {tab === "overview" ? (
        <div className="dashboard-metrics mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => setActiveMetric("compliance")}
            className="surface-card p-3 text-center rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <span className="text-[11px] text-muted-foreground">متوسط الفروع بعد الخصومات</span>
            <div className="mt-1 text-xl font-black text-primary">
              {snapshotQuery.isError
                ? "تعذر التحميل"
                : snapshotQuery.isPending
                  ? "…"
                  : summary?.after == null
                    ? "لا توجد فحوصات"
                    : `${summary.after}%`}
            </div>
            {summary?.before != null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                قبل الخصومات: {summary.before}%
              </p>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveMetric("visits")}
            className="surface-card p-3 text-center rounded-xl border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <span className="text-[11px] text-muted-foreground">إجمالي الزيارات</span>
            <div className="mt-1 text-xl font-black">{summaryCount(summary?.totalAudits)}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMetric("visits")}
            className="surface-card p-3 text-center rounded-xl border border-border hover:border-emerald-500/50 hover:bg-muted/30 transition-colors"
          >
            <span className="text-[11px] text-muted-foreground">فحوصات معتمدة</span>
            <div className="mt-1 text-xl font-black text-emerald-600">
              {summaryCount(summary?.submittedCount)}
            </div>
          </button>

          {showDrafts && (
            <button
              type="button"
              onClick={() => setActiveMetric("visits")}
              className="surface-card p-3 text-center rounded-xl border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors"
            >
              <span className="text-[11px] text-muted-foreground">قيد التنفيذ (مسودات)</span>
              <div className="mt-1 text-xl font-black text-amber-600">
                {summaryCount(summary?.draftsCount)}
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveMetric("nonCompliance")}
            className="surface-card p-3 text-center rounded-xl border border-border hover:border-indigo-500/50 hover:bg-muted/30 transition-colors"
          >
            <span className="text-[11px] text-muted-foreground">حالات عدم مطابقة</span>
            <div className="mt-1 text-xl font-black text-indigo-600">
              {summaryCount(summary?.nonCompliant)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveMetric("critical")}
            className="surface-card p-3 text-center rounded-xl border border-border hover:border-destructive/50 hover:bg-muted/30 transition-colors"
          >
            <span className="text-[11px] text-muted-foreground">مخالفات صريحة (حرجة)</span>
            <div className="mt-1 text-xl font-black text-destructive">
              {summaryCount(summary?.critical)}
            </div>
          </button>
        </div>
      ) : null}

      {tab === "overview" && snapshotQuery.isSuccess && (
        <div className="mt-4 flex items-center justify-between gap-3" dir="rtl">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "ظهرت المؤشرات؛ جاري تحميل تفاصيل الفترة المختارة في الخلفية…"
              : "المؤشرات محسوبة من البيانات الحالية عند آخر تحديث."}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={snapshotQuery.isFetching}
            onClick={() => void refreshDashboard()}
          >
            تحديث المؤشرات
          </Button>
        </div>
      )}
      {tab === "overview" && snapshotQuery.isSuccess && isError && (
        <Button className="mt-4" onClick={() => void refetch()}>
          تعذر تحميل التفاصيل — إعادة المحاولة
        </Button>
      )}
      {canViewAll && tab === "overview" && snapshotQuery.isSuccess && !isLoading && !isError ? (
        <>
          <div className="mt-6 space-y-6">
            <div className="dashboard-panel surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-emerald-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام سلامة الغذاء
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    النسب بعد خصم القسم وقبل الخصم العام. اضغط لعرض الشهور والفروع والملاحظات
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300"
                >
                  {filteredData?.fsSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.fsSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-panel surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-indigo-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام النظافة والممارسات الصحية — GHP (المعتمدة فقط)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    مؤشرات الأقسام التابعة لتدقيق الـ GHP
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-indigo-50 text-indigo-800 border-indigo-300"
                >
                  {filteredData?.ghpSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.ghpSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-panel surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-amber-700">
                    <BarChart3 className="size-4" />
                    مؤشرات أقسام FSMS (المعتمدة فقط)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    تفصيل أقسام نظام إدارة سلامة الغذاء حسب الشهر والفرع
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                >
                  {filteredData?.fsmsSections?.length ?? 0} أقسام
                </Badge>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  جاري تحميل البيانات...
                </p>
              ) : filteredData?.fsmsSections?.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  لا توجد بيانات أقسام FSMS مرتبطة بتدقيقات معتمدة.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredData?.fsmsSections.map((sec) => (
                    <SectionCard
                      key={sec.id}
                      sec={sec}
                      onSelect={() => setActiveSectionId(sec.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-panel surface-card p-4 rounded-xl border border-border">
              <div
                className="mb-3 flex items-center justify-between border-b border-border pb-2.5"
                dir="rtl"
              >
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-amber-700">
                    <FileText className="size-4" />
                    نتائج تدقيق الدورة المستندية ونظام ISO 22000 — FSMS
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    درجة التقييم المعتمدة لكل فرع
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                >
                  {filteredData?.fsmsBranchScores.length ?? 0} فروع مدققة
                </Badge>
              </div>

              {filteredData?.fsmsBranchScores.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  لا توجد تقييمات معتمدة لتدقيق FSMS حتى الآن.
                </p>
              ) : (
                <div
                  className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  dir="rtl"
                >
                  {filteredData?.fsmsBranchScores.map((b) => (
                    <div
                      key={b.branchId}
                      className="p-3 rounded-lg border border-border bg-card shadow-2xs flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-xs text-foreground block">
                          {b.branchName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {b.auditDate || "—"}
                        </span>
                      </div>
                      <div className="text-left">
                        <span
                          className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                            (b.score ?? 0) >= 85
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {b.score}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-panel dashboard-activity surface-card mt-6 p-4 rounded-xl border border-border">
            <div
              className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5"
              dir="rtl"
            >
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Store className="size-4 text-primary" />
                  {scope === "warehouses"
                    ? "متابعة نشاط المخازن المركزية (اضغط لعرض الأوديتس والملاحظات بالشهور)"
                    : "متابعة نشاط الفروع (اضغط لعرض الأوديتس والملاحظات بالشهور)"}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  تقسيم الأوديتس والنسب والملاحظات
                </p>
              </div>
              <div className="w-full print:hidden">
                <DashboardFilterBar {...dashboardFilterProps} />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {displayedBranches.map((branch) => (
                <div
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  className="cursor-pointer flex flex-col justify-between p-3 rounded-lg bg-card border border-border shadow-xs hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
                  dir="rtl"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-xs text-foreground block">
                        {branch.nameAr}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        الكود: {branch.code}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      {branch.total} فحص
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60">
                    <span className="text-emerald-700 font-bold text-[10px]">
                      {branch.completed} معتمد
                    </span>

                    {showDrafts && (
                      <span className="text-amber-700 font-bold text-[10px]">
                        {branch.drafts} مسودة
                      </span>
                    )}

                    <span className="text-primary text-[10px] flex items-center font-bold">
                      تفاصيل <ChevronLeft className="size-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : !canViewAll ? (
        <div
          className="mt-8 surface-card p-6 rounded-xl border border-dashed border-border text-center"
          dir="rtl"
        >
          <ShieldAlert className="size-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h4 className="text-xs font-bold text-foreground">عرض مخصص للمفتشين</h4>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
            يتم عرض الملخص العام لزياراتك أعلاه، بينما التحليلات التفصيلية لمؤشرات الأقسام وأداء
            الفروع مقتصرة على حسابات الإدارة (Administrators).
          </p>
        </div>
      ) : null}

      {tab === "overview" && summary && (
        <DashboardRanking summary={summary} filters={dashboardFilterProps} />
      )}

      <Dialog open={!!activeMetric} onOpenChange={(open) => !open && setActiveMetric(null)}>
        <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right border-b border-border pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-primary">
              <BarChart3 className="size-4" />
              {activeMetric === "compliance"
                ? "تفاصيل متوسط الامتثال حسب الأوديتس"
                : activeMetric === "visits"
                  ? "تفاصيل جميع الزيارات"
                  : activeMetric === "critical"
                    ? "المخالفات الصريحة الحرجة"
                    : "حالات عدم المطابقة"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              التفاصيل محسوبة من نفس الفترة والفروع الظاهرة في الداشبورد.
            </DialogDescription>
          </DialogHeader>

          {activeMetric === "compliance" && summary && (
            <DashboardScoreDetails summary={summary} filters={dashboardFilterProps} />
          )}
          {(activeMetric === "nonCompliance" || activeMetric === "critical") && isLoading && (
            <p className="py-4 text-sm">جاري تحميل التفاصيل…</p>
          )}
          {(activeMetric === "nonCompliance" || activeMetric === "critical") && isError && (
            <Button onClick={() => void refetch()}>تعذر تحميل التفاصيل — إعادة المحاولة</Button>
          )}

          {activeMetric === "visits" && (
            <div className="space-y-2 pt-3">
              {(snapshotQuery.data?.audits ?? []).map((audit) => (
                <div
                  key={audit.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs"
                >
                  <div>
                    <p className="font-bold">{audit.branchName}</p>
                    <p className="text-muted-foreground">
                      {audit.date} · {audit.type.name_ar || audit.type.code}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/audits/$id" params={{ id: audit.id }}>
                      فتح الفحص
                    </Link>
                  </Button>
                  <Badge variant={audit.status === "submitted" ? "default" : "outline"}>
                    {audit.status === "submitted" ? "مكتمل" : "مسودة"}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {(activeMetric === "nonCompliance" || activeMetric === "critical") && (
            <div className="space-y-3 pt-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={issueBranchFilter} onValueChange={setIssueBranchFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="الفرع" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {(snapshotQuery.data?.locations ?? data?.branches ?? []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={issueProgramFilter} onValueChange={setIssueProgramFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="البرنامج" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">كل الأوديتس</SelectItem>
                    <SelectItem value="FS">Food Safety</SelectItem>
                    <SelectItem value="GHP">GHP</SelectItem>
                    <SelectItem value="FSMS">FSMS</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="month"
                  value={issueMonthFilter}
                  onChange={(event) => setIssueMonthFilter(event.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                {activeIssues
                  .filter((issue) => (activeMetric === "critical" ? issue.critical : true))
                  .map((issue, index) => (
                    <div
                      key={`${issue.auditId}-${issue.itemId}-${index}`}
                      className="rounded-lg border border-border bg-card p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">{issue.questionText}</span>
                        <Badge variant={issue.critical ? "destructive" : "outline"}>
                          {issue.score} / {issue.maxScore}
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">{issue.comment}</p>
                      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                        <span>الفرع: {issue.branchName}</span>
                        <span>القسم: {issue.sectionName}</span>
                        <span>الشهر: {issue.monthKey}</span>
                        <span>
                          القسم {issue.sectionRate}% · الفرع {issue.branchRate}%
                        </span>
                      </div>
                    </div>
                  ))}
                {!isLoading && !isError && activeIssues.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    لا توجد نتائج مطابقة للفلاتر.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeSectionId} onOpenChange={(open) => !open && setActiveSectionId(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right border-b border-border pb-3">
            <div className="flex justify-between items-center">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-primary">
                  <Layers className="size-4" />
                  مؤشرات وتفاصيل قسم: {activeSection?.nameAr}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  نسب الامتثال وملاحظات عدم المطابقة مقسمة بالشهور والفروع
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs font-bold font-mono">
                الامتثال العام: {activeSection?.complianceRate}%
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {!activeSection?.months || activeSection.months.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                لا توجد فحوصات أو ملاحظات مسجلة لهذا القسم حتى الآن.
              </p>
            ) : (
              activeSection.months.map((mObj) => {
                const monthKey = `sec-month-${activeSection.id}-${mObj.monthKey}`;
                const isMonthOpen = expandedNodes[monthKey] ?? true;

                return (
                  <div
                    key={mObj.monthKey}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div
                      onClick={() => toggleNode(monthKey)}
                      className="cursor-pointer flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border/60 select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <Calendar className="size-4 text-primary" />
                        <span className="font-bold text-xs font-mono">شهر: {mObj.monthKey}</span>
                        <Badge
                          variant={mObj.complianceRate >= 85 ? "default" : "destructive"}
                          className="text-[10px] font-mono px-2 py-0"
                        >
                          نسبة امتثال الشهر: {mObj.complianceRate}%
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-semibold">
                          {mObj.branches.length} فروع
                        </span>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform duration-200 ${isMonthOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>

                    {isMonthOpen && (
                      <div className="p-3 space-y-2.5 bg-muted/10">
                        {mObj.branches.map((bObj) => {
                          const branchKey = `sec-br-${mObj.monthKey}-${bObj.branchId}`;
                          const isBranchOpen = expandedNodes[branchKey] ?? false;

                          return (
                            <div
                              key={bObj.branchId}
                              className="rounded-lg border border-border/80 bg-background overflow-hidden"
                            >
                              <div
                                onClick={() => toggleNode(branchKey)}
                                className="cursor-pointer flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors select-none"
                              >
                                <div className="flex items-center gap-2">
                                  <Store className="size-3.5 text-muted-foreground" />
                                  <span className="font-bold text-xs text-foreground">
                                    {bObj.branchName}
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                                      bObj.complianceRate >= 85
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-destructive/10 text-destructive"
                                    }`}
                                  >
                                    {bObj.complianceRate}% امتثال
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1 font-mono"
                                  >
                                    {bObj.items.length} عدم مطابقة
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {bObj.auditId && (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-[10px] px-2 text-primary font-bold"
                                    >
                                      <Link to="/audits/$id/report" params={{ id: bObj.auditId }}>
                                        فتح التقرير <ExternalLink className="size-2.5 mr-1" />
                                      </Link>
                                    </Button>
                                  )}
                                  <ChevronDown
                                    className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isBranchOpen ? "rotate-180" : ""}`}
                                  />
                                </div>
                              </div>

                              {isBranchOpen && (
                                <div className="p-2.5 border-t border-border/60 bg-muted/20 space-y-2">
                                  {bObj.items.length === 0 ? (
                                    <p className="text-[11px] text-emerald-700 font-semibold text-center py-1">
                                      ✓ هذا القسم مطابق تماماً ولم تسجل أي حالات عدم مطابقة.
                                    </p>
                                  ) : (
                                    bObj.items.map((item, itIdx) => (
                                      <div
                                        key={itIdx}
                                        className="p-2 rounded border border-border/70 bg-card text-xs space-y-1"
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border">
                                            {item.itemId}
                                          </span>
                                          <span className="font-mono text-[10px] text-destructive font-bold">
                                            الدرجة: {item.score} / {item.maxScore}
                                          </span>
                                        </div>
                                        <p className="font-semibold text-foreground text-[11px] leading-snug">
                                          {item.questionText}
                                        </p>
                                        <div className="p-1.5 bg-muted/40 rounded border border-border/40 text-[11px]">
                                          <span className="font-bold text-destructive block text-[10px]">
                                            الملاحظة:
                                          </span>
                                          {item.comment}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedBranchId} onOpenChange={(open) => !open && setSelectedBranchId(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right border-b border-border pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-primary">
              <Store className="size-4" />
              متابعة نشاط وملاحظات: {activeBranch?.nameAr}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              كود الفرع: {activeBranch?.code} • إجمالي الفحوصات المعتمدة:{" "}
              {activeBranch?.completed ?? 0}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="fs" className="w-full mt-2" dir="rtl">
            <TabsList className="grid grid-cols-3 w-full bg-muted/60 h-8 p-0.5 rounded-lg">
              <TabsTrigger value="fs" className="text-xs py-1 font-bold">
                Food Safety
              </TabsTrigger>
              <TabsTrigger value="ghp" className="text-xs py-1 font-bold">
                GHP
              </TabsTrigger>
              <TabsTrigger value="fsms" className="text-xs py-1 font-bold">
                FSMS
              </TabsTrigger>
            </TabsList>

            {[
              { key: "fs", dataTree: branchProgramsTree.foodSafety, title: "Food Safety" },
              { key: "ghp", dataTree: branchProgramsTree.ghp, title: "GHP" },
              { key: "fsms", dataTree: branchProgramsTree.fsms, title: "FSMS" },
            ].map((prog) => (
              <TabsContent key={prog.key} value={prog.key} className="space-y-3 pt-2">
                {prog.dataTree.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    لا توجد فحوصات معتمدة مسجلة ببرنامج {prog.title} في هذا الفرع.
                  </p>
                ) : (
                  prog.dataTree.map((mGroup) => {
                    const mKey = `prog-${prog.key}-${mGroup.monthKey}`;
                    const isMOpen = expandedNodes[mKey] ?? true;

                    return (
                      <div
                        key={mGroup.monthKey}
                        className="rounded-xl border border-border bg-card overflow-hidden"
                      >
                        <div
                          onClick={() => toggleNode(mKey)}
                          className="cursor-pointer flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border/60 select-none"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="size-4 text-primary" />
                            <span className="font-bold text-xs font-mono">
                              شهر: {mGroup.monthKey}
                            </span>
                            <Badge
                              variant={mGroup.complianceRate >= 85 ? "default" : "destructive"}
                              className="text-[10px] font-mono px-2 py-0"
                            >
                              نسبة الشهر: {mGroup.complianceRate}%
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            {mGroup.auditId && (
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2 text-primary font-bold"
                              >
                                <Link to="/audits/$id/report" params={{ id: mGroup.auditId }}>
                                  عرض التقرير <ExternalLink className="size-2.5 mr-1" />
                                </Link>
                              </Button>
                            )}
                            <ChevronDown
                              className={`size-4 text-muted-foreground transition-transform duration-200 ${isMOpen ? "rotate-180" : ""}`}
                            />
                          </div>
                        </div>

                        {isMOpen && (
                          <div className="p-3 space-y-2 bg-muted/10">
                            {mGroup.sections.map((sec) => {
                              const secNodeKey = `prog-sec-${prog.key}-${mGroup.monthKey}-${sec.sectionName}`;
                              const isSecOpen = expandedNodes[secNodeKey] ?? false;

                              return (
                                <div
                                  key={sec.sectionName}
                                  className="rounded-lg border border-border/80 bg-background overflow-hidden"
                                >
                                  <div
                                    onClick={() => toggleNode(secNodeKey)}
                                    className="cursor-pointer flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors select-none"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Layers className="size-3.5 text-primary" />
                                      <span className="font-bold text-xs text-foreground">
                                        {sec.sectionName}
                                      </span>
                                      <span
                                        className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                                          sec.complianceRate >= 85
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-destructive/10 text-destructive"
                                        }`}
                                      >
                                        {sec.complianceRate}% امتثال
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1 font-mono"
                                      >
                                        {sec.items.length} عدم مطابقة
                                      </Badge>
                                    </div>
                                    <ChevronDown
                                      className={`size-3.5 text-muted-foreground transition-transform duration-200 ${isSecOpen ? "rotate-180" : ""}`}
                                    />
                                  </div>

                                  {isSecOpen && (
                                    <div className="p-2.5 border-t border-border/60 bg-muted/20 space-y-2">
                                      {sec.items.length === 0 ? (
                                        <p className="text-[11px] text-emerald-700 font-semibold text-center py-1">
                                          ✓ هذا القسم ممتثل بالكامل (لا توجد أي بنود غير مطابقة).
                                        </p>
                                      ) : (
                                        sec.items.map((it, itIdx) => (
                                          <div
                                            key={itIdx}
                                            className="p-2 rounded border border-border/70 bg-card text-xs space-y-1"
                                          >
                                            <div className="flex justify-between items-center">
                                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border">
                                                {it.itemId}
                                              </span>
                                              <span className="font-mono text-[10px] text-destructive font-bold">
                                                الدرجة: {it.score} / {it.maxScore}
                                              </span>
                                            </div>
                                            <p className="font-semibold text-foreground text-[11px] leading-snug">
                                              {it.questionText}
                                            </p>
                                            <div className="p-1.5 bg-muted/40 rounded border border-border/40 text-[11px]">
                                              <span className="font-bold text-destructive block text-[10px]">
                                                الملاحظة:
                                              </span>
                                              {it.comment}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

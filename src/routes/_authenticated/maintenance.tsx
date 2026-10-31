import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wrench,
  Copy,
  Plus,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { useSession } from "@/hooks/useSession";
import {
  loadMaintenanceIndex,
  createMaintenanceReport,
  createMaintenanceFromLatestUnfinished,
  deleteMaintenanceReport,
  maintenancePhotoUrls,
} from "@/lib/maintenance-data";
import {
  filterLog,
  metrics,
  findingStatuses,
  severities,
  today,
  latestReports,
  type ReportSummary,
} from "@/lib/maintenance";
import { downloadMaintenanceExcel } from "@/lib/maintenance-export";
import { MaintenanceReportDialog } from "@/components/maintenance/MaintenanceReport";
import { maintenanceSelect } from "@/components/maintenance/FindingEditor";
export const Route = createFileRoute("/_authenticated/maintenance")({ component: MaintenancePage });
function MaintenancePage() {
  const access = useSectionAccess(),
    { profile } = useSession(),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["maintenance-index"],
    queryFn: loadMaintenanceIndex,
    enabled: access.canSee("maintenance"),
  });
  const [tab, setTab] = useState("overview"),
    [branch, setBranch] = useState(""),
    [severity, setSeverity] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [branchSearch, setBranchSearch] = useState(""),
    [selectedBranch, setSelectedBranch] = useState(""),
    [report, setReport] = useState<{ id: string; branch: string; focus?: string } | null>(null),
    [newReport, setNewReport] = useState<{ branch: string; source: string | null } | null>(null),
    [carryOpen, setCarryOpen] = useState(false),
    [date, setDate] = useState(today()),
    [reviewer, setReviewer] = useState(profile?.full_name ?? ""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const lock = useRef(false);
  const rows = useMemo(
    () => filterLog(q.data?.findings ?? [], branch, severity, status, tab === "log" ? search : ""),
    [q.data, branch, severity, status, search, tab],
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const visiblePhotos = rows
    .slice(currentPage * 25, currentPage * 25 + 25)
    .flatMap((f) => f.photos.slice(0, 1));
  const thumbnails = useQuery({
    queryKey: ["maintenance-log-thumbnails", visiblePhotos],
    queryFn: () => maintenancePhotoUrls(visiblePhotos),
    enabled: tab === "log" && visiblePhotos.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const m = metrics(rows);
  const latest = latestReports(q.data?.reports ?? []);
  async function changed() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["maintenance-index"] }),
      qc.invalidateQueries({ queryKey: ["maintenance-report"] }),
    ]);
  }
  async function create() {
    if (lock.current || !newReport) return;
    if (!date || !reviewer.trim()) {
      toast.error("حدد تاريخ الفحص والمراجع");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const id =
        carryOpen && !newReport.source
          ? await createMaintenanceFromLatestUnfinished(newReport.branch, date, reviewer.trim())
          : await createMaintenanceReport(
              newReport.branch,
              date,
              reviewer.trim(),
              newReport.source,
            );
      setReport({ id, branch: newReport.branch });
      setNewReport(null);
      await changed();
    } catch (e) {
      // If creation succeeded but the response or cleanup failed, refresh so the user can see any draft left behind.
      void qc.invalidateQueries({ queryKey: ["maintenance-index"] });
      toast.error(e instanceof Error ? e.message : "تعذر إنشاء التقرير");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove(r: ReportSummary) {
    if (
      lock.current ||
      !window.confirm(
        "حذف التقرير بكل ملاحظاته؟ لو هو الأحدث، التقرير السابق هيظهر في السجل بدلًا منه.",
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteMaintenanceReport(r.id, r.version);
      await changed();
      toast.success("تم حذف التقرير");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function exportLog() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const urls = await maintenancePhotoUrls(rows.flatMap((r) => r.photos));
      await downloadMaintenanceExcel(rows, `Maintenance Observations Log ${today()}`, urls);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تصدير السجل");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const branchName = (id: string) => q.data?.branches.find((b) => b.id === id)?.name_ar ?? "";
  const openNew = (id: string, source: string | null) => {
    setCarryOpen(false);
    setDate(today());
    setReviewer(profile?.full_name ?? "");
    setNewReport({ branch: id, source });
  };
  const filters = (
    <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
      <label className="space-y-2 text-sm">
        الفرع
        <select
          className={maintenanceSelect}
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل الفروع</option>
          {q.data?.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name_ar}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        الخطورة
        <select
          className={maintenanceSelect}
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل الدرجات</option>
          {Object.entries(severities).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        الحالة
        <select
          className={maintenanceSelect}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">كل الحالات</option>
          {Object.entries(findingStatuses).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  return (
    <AppShell title="الصيانة">
      <div className="space-y-6" dir="rtl">
        <div className="rounded-2xl bg-primary p-6 text-primary-foreground">
          <Wrench className="mb-3 size-7" />
          <h1 className="text-2xl font-bold">مركز متابعة الصيانة</h1>
          <p className="mt-2 text-sm opacity-90">
            متابعة ملاحظات الفروع والإجراءات التصحيحية حتى الإغلاق
          </p>
        </div>
        {q.isPending ? (
          <p role="status">جارٍ تحميل بيانات الصيانة…</p>
        ) : q.isError ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <p role="alert">{q.error.message}</p>
              <Button onClick={() => void q.refetch()}>إعادة المحاولة</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              المؤشرات والسجل يعرضان أحدث تقرير <strong>معتمد</strong> لكل فرع حسب تاريخ الفحص.
              المسودات والتقارير السابقة محفوظة في سجل الفرع. لا يتم جمع الكوارترات فوق بعضها.
            </p>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-5 grid w-full grid-cols-3">
                <TabsTrigger value="overview">المؤشرات</TabsTrigger>
                <TabsTrigger value="branches">الفروع</TabsTrigger>
                <TabsTrigger value="log">سجل الملاحظات</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-5">
                {filters}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    [CheckCircle2, "نسبة الإغلاق", m.rate === null ? "—" : m.rate.toFixed(1) + "%"],
                    [Wrench, "إجمالي الملاحظات", m.total],
                    [Clock, "حالات لم تغلق", m.open],
                    [AlertTriangle, "خطورة عالية لم تغلق", m.high],
                    [Clock, "متأخرة عن موعد الإغلاق", m.overdue],
                  ].map(([Icon, label, value]) => {
                    const I = Icon as typeof Wrench;
                    return (
                      <Card key={String(label)}>
                        <CardContent className="p-5">
                          <I className="mb-4 size-5 text-primary" />
                          <p className="text-sm text-muted-foreground">{String(label)}</p>
                          <p className="mt-2 text-3xl font-bold">{String(value)}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <Card>
                    <CardContent className="space-y-5 p-5">
                      <h2 className="font-bold">توزيع الحالات</h2>
                      {Object.entries(findingStatuses).map(([v, l]) => {
                        const n = rows.filter((f) => f.status === v).length;
                        return (
                          <div key={v}>
                            <div className="mb-2 flex justify-between text-sm">
                              <span>{l}</span>
                              <span>{n}</span>
                            </div>
                            <div className="h-3 rounded-full bg-muted">
                              <div
                                className="h-3 rounded-full bg-primary"
                                style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-5 p-5">
                      <h2 className="font-bold">توزيع الخطورة</h2>
                      {Object.entries(severities).map(([v, l]) => {
                        const n = rows.filter((f) => f.severity === v).length;
                        return (
                          <div key={v}>
                            <div className="mb-2 flex justify-between text-sm">
                              <span>{l}</span>
                              <span>{n}</span>
                            </div>
                            <div className="h-3 rounded-full bg-muted">
                              <div
                                className={`h-3 rounded-full ${v === "high" ? "bg-red-500" : v === "medium" ? "bg-amber-500" : "bg-emerald-600"}`}
                                style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
                <p className="text-xs text-muted-foreground">
                  نسبة الإغلاق = الحالات «تم» ÷ إجمالي الملاحظات بعد الفلاتر. التأخير يحتاج موعد
                  إغلاق مستهدف ولا يشمل الحالات المغلقة.
                </p>
                <h2 className="text-lg font-bold">متابعة الفروع</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {q.data.branches
                    .filter((b) => !branch || b.id === branch)
                    .map((b) => {
                      const findings = rows.filter((f) => f.branch_id === b.id),
                        m = metrics(findings),
                        last = latest.find((r) => r.branch_id === b.id);
                      return (
                        <button
                          key={b.id}
                          className="rounded-xl border bg-card p-4 text-start hover:border-primary"
                          onClick={() => {
                            setSelectedBranch(b.id);
                            setTab("branches");
                          }}
                        >
                          <strong>{b.name_ar}</strong>
                          <p className="mt-2 text-sm">
                            {last
                              ? `${m.open} غير مغلقة · ${m.high} عالية الخطورة`
                              : "لم يتم اعتماد تقرير بعد"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            آخر فحص معتمد: {last?.inspection_date ?? "—"}
                          </p>
                        </button>
                      );
                    })}
                </div>
              </TabsContent>
              <TabsContent value="branches" className="space-y-5">
                {selectedBranch ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Button variant="ghost" onClick={() => setSelectedBranch("")}>
                          <ArrowRight className="size-4" />
                          كل الفروع
                        </Button>
                        <h2 className="mt-2 text-xl font-bold">{branchName(selectedBranch)}</h2>
                      </div>
                      <Button disabled={busy} onClick={() => openNew(selectedBranch, null)}>
                        <Plus className="size-4" />
                        إضافة تقرير
                      </Button>
                    </div>
                    <div className="overflow-x-auto rounded-xl border bg-card">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {[
                              "تاريخ الفحص",
                              "المراجع",
                              "الحالة",
                              "الملاحظات",
                              "غير مغلقة",
                              "الإجراءات",
                            ].map((s) => (
                              <th key={s} className="p-4 text-start">
                                {s}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {q.data.reports
                            .filter((r) => r.branch_id === selectedBranch)
                            .map((r) => (
                              <tr key={r.id} className="border-t">
                                <td className="p-4">
                                  {r.inspection_date}
                                  {latest.some((l) => l.id === r.id) && (
                                    <span className="mr-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                                      الأحدث المعتمد
                                    </span>
                                  )}
                                </td>
                                <td className="p-4">{r.reviewer}</td>
                                <td className="p-4">{r.status === "draft" ? "مسودة" : "معتمد"}</td>
                                <td className="p-4">{r.total}</td>
                                <td className="p-4">{r.total - r.resolved}</td>
                                <td className="flex flex-wrap gap-2 p-4">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setReport({ id: r.id, branch: r.branch_id })}
                                  >
                                    فتح التقرير
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => openNew(r.branch_id, r.id)}
                                  >
                                    <Copy className="size-3" />
                                    نسخة جديدة
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => void remove(r)}
                                  >
                                    حذف
                                  </Button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!q.data.reports.some((r) => r.branch_id === selectedBranch) && (
                        <p className="p-10 text-center">
                          لا توجد تقارير. ابدأ بإضافة أول تقرير للفرع.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Input
                      aria-label="البحث عن فرع"
                      placeholder="ابحث باسم الفرع…"
                      value={branchSearch}
                      onChange={(e) => setBranchSearch(e.target.value)}
                    />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {q.data.branches
                        .filter((b) => b.name_ar.includes(branchSearch))
                        .map((b) => {
                          const last = latest.find((r) => r.branch_id === b.id);
                          return (
                            <button
                              key={b.id}
                              className="rounded-2xl border bg-card p-5 text-start shadow-sm transition hover:-translate-y-1 hover:border-primary"
                              onClick={() => setSelectedBranch(b.id)}
                            >
                              <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Building2 className="size-7" />
                              </div>
                              <h2 className="text-lg font-bold">{b.name_ar}</h2>
                              <p className="mt-3 text-sm">
                                {last
                                  ? `${last.total - last.resolved} حالات غير مغلقة · ${last.high_open} عالية الخطورة`
                                  : "لا يوجد تقرير معتمد"}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                آخر فحص: {last?.inspection_date ?? "—"}
                              </p>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </TabsContent>
              <TabsContent value="log" className="space-y-5">
                {filters}
                <div className="flex flex-wrap justify-between gap-3">
                  <Input
                    className="sm:max-w-md"
                    placeholder="ابحث في القسم أو الملاحظة…"
                    aria-label="البحث في الملاحظات"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                  <Button disabled={busy || !rows.length} onClick={() => void exportLog()}>
                    <FileSpreadsheet className="size-4" />
                    تصدير النتائج Excel بالصور ({rows.length})
                  </Button>
                </div>
                {thumbnails.isError && (
                  <p role="alert" className="text-sm">
                    تعذر تحميل الصور المصغرة.{" "}
                    <Button variant="outline" onClick={() => void thumbnails.refetch()}>
                      إعادة المحاولة
                    </Button>
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {["الفرع / الفحص", "القسم", "الملاحظة", "الخطورة", "الحالة", "الإجراء"].map(
                          (s) => (
                            <th className="p-4 text-start" key={s}>
                              {s}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(currentPage * 25, currentPage * 25 + 25).map((f) => (
                        <tr key={f.id} className="border-t">
                          <td className="p-4">
                            {f.branch_name}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {f.inspection_date}
                            </p>
                          </td>
                          <td className="p-4">{f.section}</td>
                          <td className="min-w-64 whitespace-pre-wrap p-4">
                            {f.photos[0] && thumbnails.data?.[f.photos[0]] && (
                              <button
                                aria-label="فتح صور الملاحظة"
                                className="mb-2 block"
                                onClick={() => setReport({ id: f.report_id, branch: f.branch_id })}
                              >
                                <img
                                  src={thumbnails.data[f.photos[0]]}
                                  alt={f.description}
                                  className="size-20 rounded-lg object-cover"
                                  loading="lazy"
                                />
                              </button>
                            )}
                            {f.description}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {f.photos.length} صور · {f.assigned_to || "لم يحدد المسؤول"}
                            </p>
                          </td>
                          <td className="p-4">
                            <span
                              className={
                                f.severity === "high"
                                  ? "rounded bg-red-100 px-2 py-1 text-red-800"
                                  : "rounded bg-muted px-2 py-1"
                              }
                            >
                              {severities[f.severity]}
                            </span>
                          </td>
                          <td className="p-4">{findingStatuses[f.status]}</td>
                          <td className="p-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReport({ id: f.report_id, branch: f.branch_id, focus: f.id })
                              }
                            >
                              عرض / تعديل
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && (
                    <p className="p-10 text-center text-muted-foreground">
                      لا توجد ملاحظات مطابقة. التقارير المسودة لا تظهر هنا.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    السابق
                  </Button>
                  <span className="text-sm">
                    {rows.length
                      ? `${currentPage * 25 + 1}–${Math.min(rows.length, (currentPage + 1) * 25)} من ${rows.length}`
                      : "0 ملاحظة"}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(currentPage + 1) * 25 >= rows.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    التالي
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
        {newReport && (
          <Dialog
            open
            onOpenChange={(o) => {
              if (!o && !busy) setNewReport(null);
            }}
          >
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>
                  {newReport.source ? "إنشاء نسخة مستقلة" : "إضافة تقرير"} —{" "}
                  {branchName(newReport.branch)}
                </DialogTitle>
              </DialogHeader>
              <label>
                تاريخ الفحص
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                المراجع
                <Input
                  maxLength={200}
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                />
              </label>
              {!newReport.source && (
                <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={carryOpen}
                    disabled={busy || !latest.some((r) => r.branch_id === newReport.branch)}
                    onChange={(e) => setCarryOpen(e.target.checked)}
                  />
                  <span>
                    انقل ملاحظات «لم يتم» من أحدث تقرير معتمد للفرع، بصورها وتفاصيلها.
                    <small className="mt-1 block text-muted-foreground">
                      تُنقل حالة «لم يتم» فقط؛ الحالات الأخرى لا تُنقل.
                    </small>
                  </span>
                </label>
              )}
              <p className="text-sm text-muted-foreground">
                التقرير الجديد مسودة. الاعتماد هو اللي يحدث السجل والمؤشرات.{" "}
                {newReport.source
                  ? "النسخ ينقل كل الملاحظات وحالتها وصورها بدون تغيير الأصل."
                  : carryOpen
                    ? "الملاحظات المنقولة نسخة مستقلة؛ التقرير السابق لا يتغير."
                    : "يمكنك البدء بتقرير فارغ أو اختيار نقل الملاحظات أعلاه."}
              </p>
              <Button disabled={busy} onClick={() => void create()}>
                {busy ? "جارٍ الإنشاء…" : "إنشاء وفتح التقرير"}
              </Button>
            </DialogContent>
          </Dialog>
        )}
        {report && (
          <MaintenanceReportDialog
            id={report.id}
            branch={branchName(report.branch)}
            onClose={() => setReport(null)}
            onChanged={() => void changed()}
            {...(report.focus ? { focusFinding: report.focus } : {})}
          />
        )}
      </div>
    </AppShell>
  );
}

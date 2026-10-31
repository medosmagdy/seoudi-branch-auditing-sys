import { lazy, Suspense } from "react";
const ImportDialog = lazy(() =>
  import("./MaintenanceImportDialog").then((m) => ({ default: m.MaintenanceImportDialog })),
);
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  blankFinding,
  filterReportFindings,
  findingStatuses,
  severities,
  metrics,
  reportFileName,
  type MaintenanceReport,
  type Finding,
} from "@/lib/maintenance";
import {
  loadMaintenanceReport,
  maintenancePhotoUrls,
  saveMaintenanceReport,
} from "@/lib/maintenance-data";
import { maintenanceReportRows, downloadMaintenanceExcel } from "@/lib/maintenance-export";
import { MaintenancePdfDocument } from "./MaintenancePdfDocument";
import { FindingEditor, maintenanceSelect } from "./FindingEditor";
export function MaintenanceReportDialog({
  id,
  branch,
  onClose,
  onChanged,
  focusFinding,
}: {
  id: string;
  branch: string;
  onClose: () => void;
  onChanged: () => void;
  focusFinding?: string;
}) {
  const closeRequest = useRef<() => void>(onClose);
  const q = useQuery({
    queryKey: ["maintenance-report", id],
    queryFn: () => loadMaintenanceReport(id),
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeRequest.current();
      }}
    >
      <DialogContent
        className="flex max-h-[95vh] flex-col overflow-hidden sm:max-w-6xl"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>تقرير صيانة — {branch}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-1">
          {q.isPending ? (
            <div role="status">
              جارٍ تحميل التقرير…
              <Button variant="outline" onClick={onClose}>
                رجوع
              </Button>
            </div>
          ) : q.isError ? (
            <div role="alert">
              تعذر تحميل التقرير<Button onClick={() => void q.refetch()}>إعادة المحاولة</Button>
              <Button onClick={onClose}>رجوع</Button>
            </div>
          ) : (
            <ReportEditor
              key={id}
              initial={q.data}
              branch={branch}
              onClose={onClose}
              closeRequest={closeRequest}
              onChanged={onChanged}
              {...(focusFinding ? { focusFinding } : {})}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ReportEditor({
  initial,
  branch,
  onClose,
  onChanged,
  focusFinding,
  closeRequest,
}: {
  initial: MaintenanceReport;
  closeRequest: React.RefObject<() => void>;
  branch: string;
  onClose: () => void;
  onChanged: () => void;
  focusFinding?: string;
}) {
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | Finding["status"]>("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [tempBranchManager, setTempBranchManager] = useState(initial.branch_manager ?? "");
  const [tempAreaManager, setTempAreaManager] = useState(initial.maintenance_area_manager ?? "");
  const [report, setReport] = useState(initial),
    [saved, setSaved] = useState(initial),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Finding | null>(
      () => initial.findings.find((f) => f.id === focusFinding) ?? null,
    );
  const lock = useRef(false),
    documentRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(report) !== JSON.stringify(saved),
    m = metrics(report.findings);
  useEffect(() => {
    closeRequest.current = () => {
      if (!busy && (!dirty || window.confirm("فيه تغييرات غير محفوظة. الخروج بدون حفظ؟")))
        onClose();
    };
    return () => {
      closeRequest.current = onClose;
    };
  }, [busy, dirty, onClose, closeRequest]);
  const sections = [...new Set(report.findings.map((f) => f.section))];
  useEffect(() => {
    if (sectionFilter !== "all" && !sections.includes(sectionFilter)) setSectionFilter("all");
  }, [sectionFilter, report.findings]);
  const visibleFindings = filterReportFindings(report.findings, statusFilter, sectionFilter);
  const hasManagerFields =
    report.branch_manager !== undefined && report.maintenance_area_manager !== undefined;
  const branchManager = hasManagerFields ? (report.branch_manager ?? "") : tempBranchManager;
  const areaManager = hasManagerFields ? (report.maintenance_area_manager ?? "") : tempAreaManager;
  const scope = `${sectionFilter === "all" ? "كل الأقسام" : sectionFilter} · ${statusFilter === "all" ? "كل الحالات" : findingStatuses[statusFilter]}`;
  const visibleStats = metrics(visibleFindings.map((x) => x.finding));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const paths = visibleFindings.flatMap(({ finding }) => finding.photos);
  const photos = useQuery({
    queryKey: ["maintenance-photos", paths],
    queryFn: () => maintenancePhotoUrls(paths),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
  async function save(submit = false) {
    if (lock.current) return;
    if (
      submit &&
      report.findings.length === 0 &&
      !window.confirm(
        "اعتماد تقرير بدون ملاحظات؟ لو ده أحدث فحص للفرع، السجل هيعرض صفر ملاحظات بدل التقرير السابق.",
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      const next = { ...report, status: submit ? ("submitted" as const) : report.status };
      const version = await saveMaintenanceReport(next);
      const value = { ...next, version };
      setReport(value);
      setSaved(value);
      onChanged();
      toast.success("تم حفظ التقرير");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function exportReport(kind: "pdf" | "excel") {
    if (lock.current || dirty || !photos.isSuccess) return;
    lock.current = true;
    setBusy(true);
    try {
      const suffix = [
        sectionFilter === "all" ? "" : sectionFilter,
        statusFilter === "all" ? "" : findingStatuses[statusFilter],
      ]
        .filter(Boolean)
        .join(" - ")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ");
      const filename =
        reportFileName(branch, report.inspection_date) + (suffix ? ` - ${suffix}` : "");
      if (kind === "excel")
        await downloadMaintenanceExcel(
          maintenanceReportRows(
            { ...report, findings: visibleFindings.map((x) => x.finding) },
            branch,
          ),
          filename,
          photos.data,
        );
      else {
        const node = documentRef.current;
        if (!node) throw new Error("تعذر تجهيز التقرير");
        const { downloadMaintenancePdf } = await import("@/lib/maintenance-pdf");
        await downloadMaintenancePdf(node, filename);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصدير");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          تاريخ الفحص
          <Input
            type="date"
            value={report.inspection_date}
            disabled={busy}
            onChange={(e) => setReport((r) => ({ ...r, inspection_date: e.target.value }))}
          />
        </label>
        <label>
          المراجع
          <Input
            maxLength={200}
            value={report.reviewer}
            disabled={busy}
            onChange={(e) => setReport((r) => ({ ...r, reviewer: e.target.value }))}
          />
        </label>
        <div className="rounded-xl bg-muted p-3">
          {report.status === "draft"
            ? "مسودة — لا تدخل المؤشرات والسجل"
            : "معتمد — أحدث تاريخ فحص يدخل السجل"}
          <p className="text-xs">
            {m.total} ملاحظة · {m.open} غير مغلقة · {m.high} عالية الخطورة غير مغلقة
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          مدير الفرع
          <Input
            maxLength={200}
            value={branchManager}
            disabled={busy}
            onChange={(e) =>
              hasManagerFields
                ? setReport((r) => ({ ...r, branch_manager: e.target.value }))
                : setTempBranchManager(e.target.value)
            }
          />
        </label>
        <label>
          مدير منطقة الصيانة
          <Input
            maxLength={200}
            value={areaManager}
            disabled={busy}
            onChange={(e) =>
              hasManagerFields
                ? setReport((r) => ({ ...r, maintenance_area_manager: e.target.value }))
                : setTempAreaManager(e.target.value)
            }
          />
        </label>
        {!hasManagerFields && (
          <p className="sm:col-span-2 text-xs text-amber-700">
            الأسماء تستخدم في PDF خلال هذه الجلسة؛ حفظها في التقرير يحتاج تفعيل إضافة الداتابيز.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {report.status === "draft" && (
          <Button variant="outline" disabled={busy} onClick={() => setImporting(true)}>
            استيراد ملف Excel
          </Button>
        )}

        <Button disabled={busy} onClick={() => void save()}>
          حفظ التغييرات
        </Button>
        {report.status === "draft" && (
          <Button disabled={busy} onClick={() => void save(true)}>
            حفظ واعتماد التقرير
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setEditing({ ...blankFinding(), section: sectionFilter === "all" ? "" : sectionFilter })
          }
        >
          + إضافة ملاحظة
        </Button>
        <Button
          variant="outline"
          disabled={busy || dirty || !photos.isSuccess}
          onClick={() => void exportReport("pdf")}
        >
          تصدير PDF
        </Button>
        <Button
          variant="outline"
          disabled={busy || dirty || !photos.isSuccess}
          onClick={() => void exportReport("excel")}
        >
          تصدير Excel بالصور
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => closeRequest.current()}>
          رجوع للتقارير
        </Button>
      </div>
      {dirty && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="status">
          تغييرات غير محفوظة؛ احفظ التقرير لتظهر في السجل ولتتمكن من التصدير.
        </p>
      )}
      {photos.isError && (
        <p role="alert">
          تعذر تحميل الصور.{" "}
          <Button variant="outline" onClick={() => void photos.refetch()}>
            إعادة المحاولة
          </Button>
        </p>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold">الأقسام</p>
        <div role="tablist" aria-label="أقسام التقرير" className="flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            role="tab"
            aria-controls="maintenance-findings-panel"
            aria-selected={sectionFilter === "all"}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm ${sectionFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card"}`}
            onClick={() => setSectionFilter("all")}
          >
            كل الأقسام ({report.findings.length})
          </button>
          {sections.map((section) => (
            <button
              type="button"
              role="tab"
              aria-controls="maintenance-findings-panel"
              aria-selected={sectionFilter === section}
              key={section}
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm ${sectionFilter === section ? "bg-primary text-primary-foreground" : "bg-card"}`}
              onClick={() => setSectionFilter(section)}
            >
              {section} ({report.findings.filter((f) => f.section === section).length})
            </button>
          ))}
        </div>
      </div>
      <label className="block max-w-xs space-y-2 text-sm">
        حالة الملاحظة
        <select
          aria-label="فلترة ملاحظات التقرير حسب الحالة"
          className={maintenanceSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">كل الحالات</option>
          {Object.entries(findingStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {statusFilter !== "all" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !report.findings.some((f) => f.status === statusFilter)}
            onClick={() => {
              const count = report.findings.filter((f) => f.status === statusFilter).length;
              if (count && window.confirm(`حذف ${count} ملاحظة بحالة «${findingStatuses[statusFilter]}» من جميع أقسام هذا التقرير؟ لن يثبت الحذف إلا بعد حفظ التقرير.`)) {
                setReport((r) => ({ ...r, findings: r.findings.filter((f) => f.status !== statusFilter) }));
              }
            }}
          >
            حذف كل ملاحظات «{findingStatuses[statusFilter]}»
          </Button>
          <span className="text-sm text-muted-foreground">يشمل الحذف كل الأقسام، ويُثبّت عند حفظ التقرير.</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        المعروض: {visibleFindings.length} من {report.findings.length} ملاحظة. التصدير يشمل الملاحظات
        المعروضة فقط.
      </p>
      <div
        id="maintenance-findings-panel"
        role="tabpanel"
        className="space-y-4 rounded-xl bg-white p-5 text-slate-900"
        dir="rtl"
      >
        <header data-report-block className="border-b pb-4">
          <h2 className="text-2xl font-bold">تقرير الصيانة — {branch}</h2>
          <p>{reportFileName(branch, report.inspection_date)}</p>
          <p>
            تاريخ الفحص: {report.inspection_date} · المراجع: {report.reviewer} ·{" "}
            {report.status === "draft" ? "مسودة" : "معتمد"}
          </p>
          <p>
            تم: {visibleStats.resolved} | لم تغلق: {visibleStats.open} | نسبة الإغلاق:{" "}
            {visibleStats.rate === null ? "—" : visibleStats.rate.toFixed(2) + "%"}
          </p>
        </header>
        {!report.findings.length && (
          <p className="py-10 text-center text-muted-foreground">أضف أول ملاحظة لهذا التقرير.</p>
        )}
        {report.findings.length > 0 && visibleFindings.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">لا توجد ملاحظات بهذه الحالة.</p>
        )}
        {Array.from({ length: Math.ceil(visibleFindings.length / 3) }, (_, group) => (
          <section key={group} data-report-page className="space-y-4 bg-white p-2">
            <div data-report-block className="border-b pb-3 text-sm">
              <strong>تقرير الصيانة — {branch}</strong>
              <p>
                الفحص: {report.inspection_date} · المراجع: {report.reviewer} ·{" "}
                {report.status === "draft" ? "مسودة" : "معتمد"}
              </p>
              <p>
                تم: {visibleStats.resolved} | لم تغلق: {visibleStats.open} | الإغلاق:{" "}
                {visibleStats.rate === null ? "—" : visibleStats.rate.toFixed(2) + "%"} · مجموعة{" "}
                {group + 1}
              </p>
            </div>
            {visibleFindings.slice(group * 3, group * 3 + 3).map(({ finding: f, index: i }) => {
              return (
                <Card key={f.id} data-report-block className="border shadow-none">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          M-{String(i + 1).padStart(3, "0")} · {f.section}
                        </p>
                        <h3 className="mt-1 font-bold">{f.description}</h3>
                      </div>
                      <span
                        className={
                          f.severity === "high"
                            ? "rounded-full bg-red-100 px-3 py-1 text-sm text-red-800"
                            : "rounded-full bg-slate-100 px-3 py-1 text-sm"
                        }
                      >
                        {severities[f.severity]} · {findingStatuses[f.status]}
                      </span>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <p>تاريخ العطل: {f.initial_history || "—"}</p>
                      <p>مسؤول التنفيذ: {f.assigned_to || "—"}</p>
                      <p>موعد الإغلاق المستهدف: {f.due_date || "—"}</p>
                      {f.corrective_action && (
                        <p className="whitespace-pre-wrap">
                          الإجراء التصحيحي: {f.corrective_action}
                        </p>
                      )}
                      {f.evidence && <p className="whitespace-pre-wrap">الأدلة: {f.evidence}</p>}
                      {f.comments && <p className="whitespace-pre-wrap">التعليقات: {f.comments}</p>}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {f.photos.map((p, n) => (
                        <a href={photos.data?.[p]} key={p} target="_blank" rel="noreferrer">
                          <img
                            src={photos.data?.[p]}
                            alt={`صورة ${n + 1} — ${f.description}`}
                            className="max-h-60 w-64 rounded-lg object-contain"
                            crossOrigin="anonymous"
                          />
                        </a>
                      ))}
                    </div>
                    <div className="flex gap-2 print:hidden">
                      <Button
                        disabled={busy}
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(f)}
                      >
                        تعديل
                      </Button>
                      <Button
                        disabled={busy}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm("حذف الملاحظة من هذا التقرير؟"))
                            setReport((r) => ({
                              ...r,
                              findings: r.findings.filter((x) => x.id !== f.id),
                            }));
                        }}
                      >
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ))}
      </div>
      <div className="pointer-events-none fixed left-[-10000px] top-0" aria-hidden="true" inert>
        <div ref={documentRef}>
          <MaintenancePdfDocument
            report={{ ...report, findings: visibleFindings.map((x) => x.finding) }}
            branch={branch}
            urls={photos.data ?? {}}
            branchManager={branchManager}
            areaManager={areaManager}
            scope={scope}
          />
        </div>
      </div>
      {importing && (
        <Suspense fallback={<p role="status">جارٍ تجهيز الاستيراد…</p>}>
          <ImportDialog
            current={report}
            branch={branch}
            onClose={() => setImporting(false)}
            onSaved={(value) => {
              setReport(value);
              setSaved(value);
              setImporting(false);
              onChanged();
            }}
          />
        </Suspense>
      )}
      {editing && (
        <FindingEditor
          key={editing.id}
          initial={editing}
          reportId={report.id}
          urls={photos.data ?? {}}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            setReport((r) => ({
              ...r,
              findings: r.findings.some((x) => x.id === f.id)
                ? r.findings.map((x) => (x.id === f.id ? f : x))
                : [...r.findings, f],
            }));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadMaintenanceReport, maintenancePhotoUrls } from "@/lib/maintenance-data";
import { maintenanceReportRows, downloadMaintenanceExcel } from "@/lib/maintenance-export";
import { reportFileName, type MaintenanceReport } from "@/lib/maintenance";
import { MaintenancePdfDocument } from "./MaintenancePdfDocument";
export function ReportRowExports({ id, branch }: { id: string; branch: string }) {
  const [busy, setBusy] = useState(false),
    [pdf, setPdf] = useState<{
      report: MaintenanceReport;
      urls: Record<string, string>;
      branchManager: string;
      areaManager: string;
    } | null>(null),
    [stage, setStage] = useState(false);
  const lock = useRef(false),
    ref = useRef<HTMLDivElement>(null);
  async function begin(kind: "pdf" | "excel") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const report = await loadMaintenanceReport(id),
        urls = await maintenancePhotoUrls(report.findings.flatMap((f) => f.photos));
      if (kind === "excel")
        await downloadMaintenanceExcel(
          maintenanceReportRows(report, branch),
          reportFileName(branch, report.inspection_date),
          urls,
        );
      else
        setPdf({
          report,
          urls,
          branchManager: report.branch_manager ?? "",
          areaManager: report.maintenance_area_manager ?? "",
        });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تجهيز التقرير");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function exportPdf() {
    if (!pdf || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      flushSync(() => setStage(true));
      if (!ref.current) throw new Error("تعذر تجهيز التقرير");
      const { downloadMaintenancePdf } = await import("@/lib/maintenance-pdf");
      await downloadMaintenancePdf(ref.current, reportFileName(branch, pdf.report.inspection_date));
      setPdf(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تصدير التقرير");
    } finally {
      setStage(false);
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void begin("excel")}>
        <FileSpreadsheet className="size-3" />
        Excel
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void begin("pdf")}>
        <FileDown className="size-3" />
        PDF
      </Button>
      {pdf && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPdf(null);
          }}
        >
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>بيانات غلاف تقرير الصيانة</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              راجع الأسماء قبل التصدير؛ التعديل هنا يخص ملف PDF الحالي فقط.
            </p>
            <label>
              مدير الفرع
              <Input
                value={pdf.branchManager}
                maxLength={200}
                disabled={busy}
                onChange={(e) => setPdf((p) => (p ? { ...p, branchManager: e.target.value } : p))}
              />
            </label>
            <label>
              مدير منطقة الصيانة
              <Input
                value={pdf.areaManager}
                maxLength={200}
                disabled={busy}
                onChange={(e) => setPdf((p) => (p ? { ...p, areaManager: e.target.value } : p))}
              />
            </label>
            <Button disabled={busy} onClick={() => void exportPdf()}>
              {busy ? "جارٍ تجهيز PDF…" : "تصدير PDF"}
            </Button>
          </DialogContent>
        </Dialog>
      )}
      {pdf && stage && (
        <div className="pointer-events-none fixed left-[-10000px] top-0" aria-hidden="true" inert>
          <div ref={ref}>
            <MaintenancePdfDocument
              report={pdf.report}
              branch={branch}
              urls={pdf.urls}
              branchManager={pdf.branchManager}
              areaManager={pdf.areaManager}
              scope="كل الأقسام · كل الحالات"
            />
          </div>
        </div>
      )}
    </>
  );
}

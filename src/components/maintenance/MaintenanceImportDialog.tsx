import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findingStatuses, severities, type MaintenanceReport } from "@/lib/maintenance";
import { saveMaintenanceReport, uploadMaintenancePhoto } from "@/lib/maintenance-data";
import { reportBranchName, branchNameKey } from "@/lib/report-branch-name";
import type { ImportPhoto, MaintenanceImport, MaintenanceWorkbook } from "@/lib/maintenance-import";
import { maintenanceSelect } from "./FindingEditor";
function ImportImage({ image }: { image: ImportPhoto }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(
      new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
    );
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [image]);
  return url ? (
    <img src={url} alt="معاينة الصورة المستوردة" className="mb-1 size-16 rounded-lg object-cover" />
  ) : null;
}
export function MaintenanceImportDialog({
  current,
  branch,
  onSaved,
  onClose,
}: {
  current: MaintenanceReport;
  branch: string;
  onSaved: (report: MaintenanceReport) => void;
  onClose: () => void;
}) {
  const [workbook, setWorkbook] = useState<MaintenanceWorkbook | null>(null),
    [preview, setPreview] = useState<MaintenanceImport | null>(null),
    [sheet, setSheet] = useState(""),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [mode, setMode] = useState<"append" | "replace">(
      current.findings.length ? "append" : "replace",
    ),
    [metadata, setMetadata] = useState(true),
    [ack, setAck] = useState(false),
    [page, setPage] = useState(0);
  const lock = useRef(false),
    uploaded = useRef(new Map<string, string>());
  const mismatch =
    !!preview?.branch &&
    branchNameKey(reportBranchName(preview.branch)) !== branchNameKey(reportBranchName(branch));
  const needsAck = mismatch || !!preview?.warnings.length;
  async function selectSheet(book: MaintenanceWorkbook, name: string) {
    setReading(true);
    setError("");
    setPreview(null);
    setSheet(name);
    setAck(false);
    setPage(0);
    try {
      setPreview(await book.preview(name));
      setSheet(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر قراءة الصفحة");
    } finally {
      setReading(false);
    }
  }
  async function choose(file: File) {
    if (lock.current) return;
    lock.current = true;
    setReading(true);
    setPreview(null);
    setWorkbook(null);
    setError("");
    uploaded.current.clear();
    try {
      if (!/\.xlsx$/i.test(file.name))
        throw new Error("اختر ملف .xlsx؛ احفظ الملفات القديمة بالصيغة دي أولًا");
      if (file.size > 30 * 1024 * 1024) throw new Error("الحد الأقصى للملف 30 ميجابايت");
      const { openMaintenanceWorkbook } = await import("@/lib/maintenance-import");
      const book = await openMaintenanceWorkbook(new Uint8Array(await file.arrayBuffer()));
      setWorkbook(book);
      await selectSheet(book, book.sheets[0]!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح الملف");
    } finally {
      setReading(false);
      lock.current = false;
    }
  }
  async function apply() {
    if (lock.current || !preview || current.status !== "draft" || (needsAck && !ack)) return;
    const expected =
      mode === "append" ? current.findings.length + preview.rows.length : preview.rows.length;
    if (expected > 1000) {
      setError("إجمالي الملاحظات أكبر من 1000. اختر استبدال أو قلل عدد الصفوف.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const images = [
        ...new Map(preview.rows.flatMap((r) => r.images).map((p) => [p.key, p])).values(),
      ];
      let next = 0,
        completed = images.filter((p) => uploaded.current.has(p.key)).length;
      setProgress(`رفع الصور ${completed} / ${images.length}`);
      const worker = async () => {
        while (next < images.length) {
          const image = images[next++]!;
          if (uploaded.current.has(image.key)) continue;
          const ext =
            image.mime === "image/png" ? "png" : image.mime === "image/webp" ? "webp" : "jpg";
          const file = new File([new Uint8Array(image.bytes)], `maintenance.${ext}`, {
            type: image.mime,
          });
          uploaded.current.set(image.key, await uploadMaintenancePhoto(current.id, file));
          setProgress(`رفع الصور ${++completed} / ${images.length}`);
        }
      };
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(3, images.length) }, worker),
      );
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
      const imported = preview.rows.map((r) => ({
        ...r.finding,
        photos: r.images.map((i) => {
          const path = uploaded.current.get(i.key);
          if (!path) throw new Error("بعض الصور لم ترفع؛ أعد المحاولة");
          return path;
        }),
      }));
      const report = {
        ...current,
        status: "draft" as const,
        inspection_date:
          metadata && preview.inspectionDate ? preview.inspectionDate : current.inspection_date,
        reviewer: metadata && preview.reviewer ? preview.reviewer : current.reviewer,
        findings: mode === "append" ? [...current.findings, ...imported] : imported,
      };
      setProgress("حفظ الملاحظات كمسودة…");
      const version = await saveMaintenanceReport(report);
      onSaved({ ...report, version });
      toast.success(`تم استيراد ${imported.length} ملاحظة بصورها وحفظ المسودة`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "تعذر الاستيراد؛ أعد المحاولة. الصور المرفوعة لن تتكرر.",
      );
    } finally {
      setBusy(false);
      setProgress("");
      lock.current = false;
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !reading) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>استيراد ملف صيانة — {branch}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          اختَر ملف Excel، راجع الملاحظات والصور، ثم استوردها كمسودة تكمل عليها. الاعتماد خطوة
          مستقلة.
        </p>
        <Input
          aria-label="ملف إكسيل الصيانة"
          type="file"
          accept=".xlsx"
          disabled={busy || reading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void choose(f);
            e.target.value = "";
          }}
        />
        {workbook && (
          <label>
            صفحة الملف
            <select
              className={maintenanceSelect}
              disabled={busy || reading}
              value={sheet}
              onChange={(e) => void selectSheet(workbook, e.target.value)}
            >
              {workbook.sheets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {reading && <p role="status">جارٍ قراءة الملاحظات وربط الصور بالخلايا…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}
        {preview && (
          <>
            <div className="grid gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-3">
              <p>
                الملاحظات: <strong>{preview.rows.length}</strong>
              </p>
              <p>
                الصور: <strong>{preview.rows.reduce((n, r) => n + r.images.length, 0)}</strong>
              </p>
              <p>
                تم: {preview.rows.filter((r) => r.finding.status === "resolved").length} · لم تغلق:{" "}
                {preview.rows.filter((r) => r.finding.status !== "resolved").length}
              </p>
              <p>الفرع المكتوب: {preview.branch || "غير محدد"}</p>
              <p>تاريخ الملف: {preview.inspectionDate || "غير محدد"}</p>
              <p>المراجع: {preview.reviewer || "غير محدد"}</p>
            </div>
            {current.findings.length > 0 && (
              <label>
                التقرير يحتوي {current.findings.length} ملاحظة
                <select
                  className={maintenanceSelect}
                  value={mode}
                  disabled={busy}
                  onChange={(e) => setMode(e.target.value as "append" | "replace")}
                >
                  <option value="append">إضافة الملاحظات المستوردة إلى الموجودة</option>
                  <option value="replace">استبدال ملاحظات هذه المسودة بالملف</option>
                </select>
              </label>
            )}
            {(preview.inspectionDate || preview.reviewer) && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={metadata}
                  disabled={busy}
                  onChange={(e) => setMetadata(e.target.checked)}
                />
                استخدام تاريخ الفحص واسم المراجع الموجودين في الملف
              </label>
            )}
            {needsAck && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                {mismatch && (
                  <p>
                    اسم فرع الملف «{preview.branch}» مختلف عن الفرع المختار «{branch}». ارجع واختَر
                    الفرع الصحيح لو الملف يخص فرعًا آخر.
                  </p>
                )}
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ack}
                    disabled={busy}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  راجعت التنبيه وأريد الاستيراد إلى هذا الفرع
                </label>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {["الصف", "القسم", "الملاحظة", "الخطورة", "الحالة", "الصور"].map((h) => (
                      <th key={h} className="p-3 text-start">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(page * 20, page * 20 + 20).map((r) => (
                    <tr key={r.row} className="border-t">
                      <td className="p-3">{r.row}</td>
                      <td className="p-3">{r.finding.section}</td>
                      <td className="min-w-64 whitespace-pre-wrap p-3">{r.finding.description}</td>
                      <td className="p-3">{severities[r.finding.severity]}</td>
                      <td className="p-3">{findingStatuses[r.finding.status]}</td>
                      <td className="p-3">
                        {r.images[0] && <ImportImage image={r.images[0]} />}
                        {r.images.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                disabled={busy || page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </Button>
              <span className="text-sm">
                {page * 20 + 1}–{Math.min((page + 1) * 20, preview.rows.length)} من{" "}
                {preview.rows.length}
              </span>
              <Button
                variant="outline"
                disabled={busy || (page + 1) * 20 >= preview.rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </>
        )}
        {busy && <p role="status">{progress} — انتظر انتهاء الاستيراد.</p>}
        <div className="flex gap-2">
          <Button
            disabled={!preview || busy || reading || (needsAck && !ack)}
            onClick={() => void apply()}
          >
            استيراد وحفظ المسودة
          </Button>
          <Button variant="outline" disabled={busy || reading} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

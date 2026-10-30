import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Loader2, Copy, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { loadReportModel } from "@/lib/report-data";
import { ReportDocument } from "@/components/report/ReportDocument";
import { auditReportFileBase } from "@/lib/audit-report-name";
import {
  auditEmailTemplate,
  auditEmailHtml,
  auditEmailDraft,
  downloadEmailDraft,
  emailRecipients,
} from "@/lib/audit-email";

export function AuditEmailButton({ auditId }: { auditId: string }) {
  const [open, setOpen] = useState(false),
    [to, setTo] = useState(""),
    [cc, setCc] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [templateError, setTemplateError] = useState("");
  const lock = useRef(false),
    reportRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["audit-email", auditId],
    queryFn: () => loadReportModel(auditId),
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const model = query.data;
  useEffect(() => {
    if (!open || !model) return;
    try {
      const draft = auditEmailTemplate(model);
      setSubject(draft.subject);
      setBody(draft.body);
      setTemplateError("");
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "تعذر تجهيز الرسالة");
      setBody("");
    }
  }, [open, model]);
  const ready =
    !!model &&
    model.status === "submitted" &&
    !query.isFetching &&
    !query.isError &&
    !templateError;
  const verifyLatest = async () => {
    const fresh = await query.refetch();
    if (fresh.isError || !fresh.data) throw new Error("تعذر التحقق من أحدث بيانات الأوديت");
    auditEmailTemplate(fresh.data);
    if (JSON.stringify(fresh.data) !== JSON.stringify(model))
      throw new Error(
        "بيانات الأوديت اتغيرت؛ راجع المعاينة والدرجات المحدثة ثم جهّز المسودة مرة أخرى",
      );
    return fresh.data;
  };
  const prepare = async (mode: "eml" | "pdf") => {
    if (lock.current || !ready || !reportRef.current || !model) return;
    lock.current = true;
    setBusy(true);
    try {
      if (mode === "eml") {
        emailRecipients(to);
        emailRecipients(cc);
        if (!subject.trim() || !body.trim()) throw new Error("اكتب عنوان الرسالة ونصها");
      }
      const fresh = await verifyLatest();
      const { nodeToPdfBlob } = await import("@/lib/export-pdf");
      const pdf = await nodeToPdfBlob(reportRef.current);
      const fileBase = auditReportFileBase(fresh);
      if (mode === "pdf") downloadEmailDraft(pdf, `${fileBase}.pdf`);
      else {
        const eml = await auditEmailDraft({
          subject,
          body,
          to,
          cc,
          pdf,
          pdfName: `${fileBase}.pdf`,
        });
        downloadEmailDraft(eml, `${fileBase}.eml`);
        toast.success(
          "تم تحميل ملف البريد ومعاه PDF؛ افتحه في Outlook وراجع حساب الإرسال والمستلمين",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تجهيز ملف البريد");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const copy = async () => {
    if (lock.current || !ready || !body.trim()) return;
    lock.current = true;
    setBusy(true);
    try {
      await verifyLatest();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error(
          "النسخ المنسق غير متاح في المتصفح ده؛ استخدم ملف البريد أو انسخ النص يدويًا",
        );
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([auditEmailHtml(body)], { type: "text/html" }),
          "text/plain": new Blob([body], { type: "text/plain" }),
        }),
      ]);
      toast.success("تم نسخ الرسالة بالتنسيق؛ الصقها في رسالة جديدة بحساب الشغل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر نسخ الرسالة");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Mail className="size-4" />
        تجهيز إيميل التقرير
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!lock.current) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تجهيز بريد الأوديت المعتمد</DialogTitle>
            <DialogDescription>
              دي مسودة للمراجعة؛ مفيش إرسال من التطبيق. افتح ملف البريد في Outlook المكتبي وراجع
              خانة From لاختيار حساب الشغل. طريقة فتحه كمسودة تعتمد على إصدار Outlook؛ لو بتستخدم
              الويب انسخ الرسالة المنسقة وأرفق PDF يدويًا.
            </DialogDescription>
          </DialogHeader>
          {query.isPending || query.isFetching ? (
            <p role="status" className="flex gap-2">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل أحدث بيانات التقرير…
            </p>
          ) : query.isError ? (
            <div role="alert">
              <p>تعذر تحميل التقرير.</p>
              <Button onClick={() => void query.refetch()}>إعادة المحاولة</Button>
            </div>
          ) : templateError ? (
            <p role="alert" className="text-destructive">
              {templateError}
            </p>
          ) : (
            <fieldset disabled={busy} className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-xs">
                To وCC اختياريين مؤقتًا؛ تقدر تكملهم في Outlook. عناوين المستلمين لا تُحفظ في النظام
                حاليًا. ملف PDF يُرفق داخل ملف البريد تلقائيًا.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>To — إلى</span>
                  <Input
                    dir="ltr"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="branch@example.com; manager@example.com"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>CC — نسخة</span>
                  <Input
                    dir="ltr"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="quality@example.com"
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span>عنوان الرسالة</span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={500}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>نص الرسالة — قابل للتعديل قبل تجهيز الملف</span>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  maxLength={20_000}
                />
              </label>
              <section
                className="rounded-lg border bg-white p-5 text-black"
                aria-label="معاينة الرسالة"
              >
                <div dangerouslySetInnerHTML={{ __html: auditEmailHtml(body) }} />
              </section>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!ready || busy} onClick={() => void prepare("eml")}>
                  {busy ? (
                    <Loader2 className="ms-2 size-4 animate-spin" />
                  ) : (
                    <Mail className="ms-2 size-4" />
                  )}
                  تحميل ملف البريد مع PDF (.eml)
                </Button>
                <Button variant="outline" disabled={!ready || busy} onClick={() => void copy()}>
                  <Copy className="ms-2 size-4" />
                  نسخ الرسالة المنسقة
                </Button>
                <Button
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() => void prepare("pdf")}
                >
                  <FileDown className="ms-2 size-4" />
                  تحميل PDF للإرفاق اليدوي
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                التظليل الأصفر محفوظ في نسخة HTML. تجهيز الملف أو نسخه لا يعني إرساله، ولا يُسجّل
                الأوديت كأنه اتبعت.
              </p>
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
      {open && model && !templateError && (
        <div
          className="pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden"
          aria-hidden="true"
          inert
        >
          <div ref={reportRef} className="w-[900px] bg-white p-4 text-black">
            <ReportDocument model={model} />
          </div>
        </div>
      )}
    </>
  );
}

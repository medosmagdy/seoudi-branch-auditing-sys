import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, FileDown, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { auditEmailDraft, downloadEmailDraft, emailRecipients } from "@/lib/audit-email";
import { summarizeNcr, type NcrFilters } from "@/lib/ncr-management";
import { loadNcrAnalysis, loadNcrRecipients } from "@/lib/report-feature-client";
import { ncrMailHtml, ncrMailTemplate, ncrProgramLabel, scoreLabel } from "@/lib/ncr-presentation";
import { NcrAnalysisReport } from "./NcrAnalysisReport";

type Analysis = Awaited<ReturnType<typeof loadNcrAnalysis>>;
export function NcrAnalysisView({
  analysis,
  filters,
  refresh,
}: {
  analysis: Analysis;
  filters: NcrFilters;
  refresh: () => void;
}) {
  const summary = useMemo(() => summarizeNcr(analysis.audits, analysis.findings), [analysis]);
  const audits = useMemo(
    () => new Map(analysis.audits.map((audit) => [audit.id, audit])),
    [analysis.audits],
  );
  const { overall, byProgram, repeated, priorities, sections } = summary;
  const reportRef = useRef<HTMLDivElement>(null);
  const action = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [body, setBody] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const [addressesBusy, setAddressesBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [subject, setSubject] = useState("");
  const file = `NCR Analysis - ${analysis.branch.name.replace(/[\\/:*?"<>|]/g, "-")} - ${filters.program} - ${filters.start} to ${filters.end}`;

  async function openMail() {
    if (addressesBusy || busy) return;
    const draft = ncrMailTemplate(analysis.branch, filters, summary);
    setSubject(draft.subject);
    setBody(draft.body);
    setTo("");
    setCc("");
    setAddressHint("");
    setAddressesBusy(true);
    setMail(true);
    try {
      const recipients = await loadNcrRecipients(analysis.branch.id);
      setTo(recipients.to_addresses.join("; "));
      if (!recipients.configured)
        setAddressHint("قائمة الفرع غير مضبوطة؛ أضف المستلمين في To يدويًا.");
    } catch (error) {
      setAddressHint(
        error instanceof Error ? error.message : "تعذر تحميل مستلمي الفرع؛ راجعهم يدويًا.",
      );
    } finally {
      setAddressesBusy(false);
    }
  }

  async function run(mode: "pdf" | "mail" | "copy") {
    if (action.current || !analysis.audits.length) return;
    action.current = true;
    setBusy(true);
    try {
      if (mode === "mail" && !emailRecipients(to).length)
        throw new Error("أضف مستلمًا واحدًا على الأقل في To");
      const fresh = await loadNcrAnalysis(filters);
      if (JSON.stringify(fresh) !== JSON.stringify(analysis)) {
        refresh();
        throw new Error("النتائج اتغيرت؛ راجع التحليل المحدث قبل التصدير.");
      }
      if (mode === "copy") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([ncrMailHtml(body)], { type: "text/html" }),
            "text/plain": new Blob([body], { type: "text/plain" }),
          }),
        ]);
        toast.success("تم نسخ نص المسودة للإرسال من حساب العمل");
        return;
      }
      const node = reportRef.current;
      if (!node?.isConnected) throw new Error("معاينة التقرير غير جاهزة");
      const { nodeToPdfBlob } = await import("@/lib/export-pdf");
      const pdf = await nodeToPdfBlob(node);
      if (mode === "pdf") downloadEmailDraft(pdf, `${file}.pdf`);
      else {
        const eml = await auditEmailDraft({
          subject,
          body,
          to,
          cc,
          pdf,
          pdfName: `${file}.pdf`,
          renderHtml: ncrMailHtml,
        });
        downloadEmailDraft(eml, `${file}.eml`);
        toast.success("مسودة البريد جاهزة بالـPDF؛ افتحها في Outlook وراجع المستلمين");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز التقرير");
    } finally {
      action.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" aria-label={`تحليل فرع ${analysis.branch.name}`}>
      <section className="surface-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{analysis.branch.name}</h2>
            <p className="text-sm text-muted-foreground">
              <bdi>
                {filters.start} → {filters.end}
              </bdi>{" "}
              • <bdi>{ncrProgramLabel[filters.program]}</bdi>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!overall.visits || busy}
              onClick={() => void run("pdf")}
            >
              <FileDown className="size-4" /> تحميل PDF
            </Button>
            <Button
              size="sm"
              disabled={!overall.visits || busy || addressesBusy}
              onClick={() => void openMail()}
            >
              <Mail className="size-4" /> تجهيز إيميل التحليل
            </Button>
          </div>
        </div>
        {!overall.visits ? (
          <p role="status" className="rounded-lg bg-muted p-4">
            لا توجد أوديتات معتمدة متاحة لهذا الفرع في الفترة ونوع الأوديت المحددين.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ["الأوديتات المعتمدة", overall.visits],
                ["متوسط الدرجة", scoreLabel(overall.average)],
                ["عدم مطابقة", overall.findings],
                ["بدرجة صفر", overall.zero],
                ["أنماط متكررة", repeated.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-background p-3">
                  <div className="text-xl font-bold">
                    <bdi>{value}</bdi>
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {(["FS", "GHP"] as const)
                .filter((p) => filters.program === "both" || filters.program === p)
                .map((p) => (
                  <span key={p} className="rounded-lg bg-muted px-3 py-2">
                    <bdi>{p}</bdi> · {byProgram[p].visits} أوديت · {byProgram[p].findings} حالة ·
                    متوسط <bdi>{scoreLabel(byProgram[p].average)}</bdi>
                  </span>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
              المتوسط للدرجات النهائية المعتمدة المسجلة فقط. التكرار محسوب بين الأوديتات، ومش معناه
              إن الحالة لسه مفتوحة.
            </p>
            {(analysis.unresolved > 0 || overall.scored < overall.visits) && (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {analysis.unresolved > 0 &&
                  `${analysis.unresolved} بند محفوظ بدرجة غير محسومة لم يُحسب كعدم مطابقة. `}
                {overall.scored < overall.visits &&
                  `${overall.visits - overall.scored} أوديت بدون نتيجة نهائية مسجلة صالحة لم يدخل في المتوسط.`}
              </p>
            )}
          </>
        )}
      </section>
      {overall.visits > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="surface-card space-y-3 p-4 sm:p-5">
              <h3 className="font-bold">أولويات التحسين</h3>
              {!priorities.length && (
                <p className="text-sm text-muted-foreground">
                  لم تتسجل درجات أقل من الحد الأقصى في الفترة دي.
                </p>
              )}
              {priorities.map((item) => (
                <article key={item.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.findings.length} حالة في {item.visits} أوديت
                    {item.zero > 0 && ` · ${item.zero} بدرجة صفر`}
                  </p>
                  <p className="mt-2">{item.action}</p>
                </article>
              ))}
            </section>
            <section className="surface-card space-y-3 p-4 sm:p-5">
              <h3 className="font-bold">الأقسام الأكثر تأثرًا</h3>
              {!sections.length && (
                <p className="text-sm text-muted-foreground">
                  لا توجد بنود مسجلة أقل من الحد الأقصى.
                </p>
              )}
              {sections.slice(0, 8).map((section) => (
                <div
                  key={section.label}
                  className="flex items-center justify-between gap-3 border-b pb-2 text-sm"
                >
                  <span>{section.label}</span>
                  <span>{section.count} حالة</span>
                </div>
              ))}
            </section>
          </div>
          <section className="surface-card space-y-3 p-4 sm:p-5">
            <div>
              <h3 className="font-bold">الأنماط المتكررة ومراجعها</h3>
              <p className="text-xs text-muted-foreground">
                الربط إمّا بنفس البند، أو بصياغات واضحة لنفس المشكلة. افتح أي نمط لمراجعة الملاحظات
                الأصلية.
              </p>
            </div>
            {!repeated.length && (
              <p className="text-sm text-muted-foreground">
                مفيش نمط ظهر في أكتر من أوديت ضمن الفلتر.
              </p>
            )}
            {repeated.map((item) => (
              <details key={item.id} className="rounded-lg border px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold">
                  {item.label} · {item.visits} أوديت · {item.findings.length} حالة
                </summary>
                <ul className="mt-2 space-y-2">
                  {item.findings.map((issue) => (
                    <Evidence
                      key={`${issue.auditId}/${issue.questionId}`}
                      issue={issue}
                      audit={audits.get(issue.auditId)!}
                    />
                  ))}
                </ul>
              </details>
            ))}
            {summary.findings.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAll(!showAll)}
                aria-expanded={showAll}
              >
                {showAll ? "إخفاء سجل البنود" : "عرض كل حالات عدم المطابقة"}
              </Button>
            )}
            {showAll && (
              <ul className="max-h-[34rem] space-y-2 overflow-auto">
                {summary.findings.map((issue) => (
                  <Evidence
                    key={`${issue.auditId}/${issue.questionId}`}
                    issue={issue}
                    audit={audits.get(issue.auditId)!}
                  />
                ))}
              </ul>
            )}
          </section>
          <details className="surface-card p-4">
            <summary className="cursor-pointer font-bold">
              الأوديتات اللي اتحللت ({overall.visits})
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {analysis.audits.map((audit) => (
                <li key={audit.id}>
                  <Link
                    className="block rounded-lg border px-3 py-2 text-sm underline"
                    to="/audits/$id/report"
                    params={{ id: audit.id }}
                  >
                    <bdi>{audit.date}</bdi> · <bdi>{audit.program}</bdi> ·{" "}
                    <bdi>{scoreLabel(audit.score)}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <div
        className="pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden"
        aria-hidden="true"
        inert
      >
        <NcrAnalysisReport
          ref={reportRef}
          branch={analysis.branch}
          filters={filters}
          summary={summary}
          audits={analysis.audits}
          unresolved={analysis.unresolved}
        />
      </div>
      <Dialog
        open={mail}
        onOpenChange={(open) => {
          if (!busy) setMail(open);
        }}
      >
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تجهيز إيميل تحليل {analysis.branch.name}</DialogTitle>
            <DialogDescription>
              نزّل المسودة مع PDF وافتحها في Outlook عشان تراجع وتبعت من حساب الشغل.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-3" disabled={addressesBusy || busy}>
            {addressesBusy && <p role="status">جارٍ تحميل To…</p>}
            {addressHint && (
              <p role="status" className="text-sm text-muted-foreground">
                {addressHint}
              </p>
            )}
            <label className="block text-sm">
              To — إلى
              <Input dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="block text-sm">
              CC — نسخة اختيارية
              <Input
                dir="ltr"
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                placeholder="تُترك فارغة افتراضيًا"
              />
            </label>
            <label className="block text-sm">
              عنوان الرسالة
              <Input
                value={subject}
                maxLength={500}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              نص الرسالة
              <Textarea
                rows={7}
                value={body}
                maxLength={20_000}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-semibold">معاينة شكل الإيميل</summary>
              <div className="mt-3" dangerouslySetInnerHTML={{ __html: ncrMailHtml(body) }} />
            </details>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void run("mail")}
                disabled={!to.trim() || !subject.trim() || !body.trim()}
              >
                <Mail className="size-4" /> تحميل مسودة الإيميل مع PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void run("copy")}
                disabled={!body.trim()}
              >
                <Copy className="size-4" /> نسخ النص
              </Button>
            </div>
          </fieldset>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Evidence({
  issue,
  audit,
}: {
  issue: Analysis["findings"][number];
  audit: Analysis["audits"][number];
}) {
  return (
    <li className="rounded-lg border bg-muted/20 p-3 text-sm">
      <p className="font-semibold">
        {issue.section} · {issue.itemId || "البند"} ·{" "}
        <bdi>
          {issue.earned}/{issue.maximum}
        </bdi>
      </p>
      <p className="mt-1">{issue.question}</p>
      {issue.observation.trim() && (
        <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">
          {issue.observation}
        </p>
      )}
      <Link
        className="mt-1 inline-block text-xs font-semibold underline"
        to="/audits/$id/report"
        params={{ id: audit.id }}
      >
        فتح الأوديت · <bdi>{audit.date}</bdi> · <bdi>{audit.program}</bdi>
      </Link>
    </li>
  );
}

import type { ReportModel } from "@/lib/report-data";
import { AlertTriangle, CheckCircle2, FileText, Image as ImageIcon, TrendingUp } from "lucide-react";

export function ReportDocument({ model }: { model: ReportModel }) {
  const rawScore = Number(model?.result?.finalScore);
  const finalPercentage = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const isPassed = finalPercentage >= 85;

  const totalDeductions = Number.isFinite(Number(model?.result?.totalDeductions))
    ? Number(model.result.totalDeductions)
    : 0;

  return (
    <div className="mx-auto w-full max-w-4xl bg-white text-foreground print:p-0" dir="rtl">
      {/* ================= الصفحة الأولى: الملخص ونسب الامتثال ================= */}
      <div data-report-page className="bg-white p-6 mb-8 rounded-2xl border border-border shadow-xs">
        {/* 1. ترويسة التقرير الرسمية */}
        <div data-report-block className="border-b-2 border-primary pb-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <img src="/seoudi-logo.png" alt="شعار سعودي" className="h-20 w-auto object-contain" />
            <div>
              <h1 className="text-2xl font-black text-primary">تقرير عدم المطابقة والملاحظات (NCR Report)</h1>
              <p className="text-sm font-semibold text-muted-foreground mt-0.5">
                {model.auditTypeName || "فحص سلامة الغذاء"} • كود التفتيش: {model.auditId.slice(0, 8)}
              </p>
            </div>
            <div className="text-left" dir="ltr">
              <span className="inline-block rounded-md bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary">
                v{model.version}
              </span>
            </div>
          </div>

          {/* بيانات التدقيق الأساسية */}
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground block text-[11px]">الفرع:</span>
              <span className="font-bold text-sm text-foreground">{model.branchName}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">تاريخ التدقيق:</span>
              <span className="font-mono font-bold text-sm text-foreground">{model.auditDate}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">المفتش:</span>
              <span className="font-bold text-foreground">{model.auditorName || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">مدير الفرع:</span>
              <span className="font-bold text-foreground">{model.branchManager || "—"}</span>
            </div>
          </div>
        </div>

        {/* 2. ملخص النتيجة والتقييم النهائي */}
        <div data-report-block className="mb-6 grid gap-3 sm:grid-cols-3">
          <div
            className={`rounded-xl border p-4 text-center ${isPassed ? "border-emerald-500/40 bg-emerald-50/50" : "border-destructive/40 bg-destructive/5"
              }`}
          >
            <span className="text-xs font-bold text-muted-foreground">النتيجة النهائية المعتمدة</span>
            <div className={`mt-1 text-3xl font-black ${isPassed ? "text-emerald-600" : "text-destructive"}`}>
              {finalPercentage}%
            </div>
            <span className="text-[11px] font-semibold block mt-1">
              {isPassed ? "مطابق لمعايير الجودة" : "يحتاج إلى إجراءات تصحيحية فورية"}
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <span className="text-xs font-bold text-muted-foreground">حالات عدم المطابقة (NCRs)</span>
            <div className="mt-1 text-3xl font-black text-destructive">
              {model.ncrs?.length ?? 0}
            </div>
            <span className="text-[11px] text-muted-foreground block mt-1">بنود تم خصم درجات منها</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <span className="text-xs font-bold text-muted-foreground">إجمالي الخصومات الإضافية</span>
            <div className="mt-1 text-3xl font-black text-amber-600">
              {totalDeductions}%
            </div>
            <span className="text-[11px] text-muted-foreground block mt-1">خصومات عامة وأقسام</span>
          </div>
        </div>

        {/* 3. اتجاه درجات الفرع شهريًا */}
        {model.history.length > 0 && (
          <div data-report-block className="mt-4 rounded-xl border border-border bg-white p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-primary">
              <TrendingUp className="size-4" /> اتجاه درجات الفرع حسب الشهر
            </h3>
            <div className="relative h-56 w-full overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-b from-emerald-50/60 to-white px-3 py-3">
              <div className="absolute inset-x-3 top-3 bottom-8 flex flex-col justify-between text-[9px] text-muted-foreground">
                {[100, 75, 50, 25, 0].map((value) => <div key={value} className="border-t border-dashed border-slate-300">{value}%</div>)}
              </div>
              <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="absolute inset-x-12 top-4 h-40 w-[calc(100%-6rem)]" role="img" aria-label="منحنى درجات الفرع الشهرية">
                <polyline
                  fill="none"
                  stroke="#0d604d"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={model.history.map((entry, index) => {
                    const x = model.history.length === 1 ? 500 : (index / (model.history.length - 1)) * 1000;
                    const y = 260 - (entry.score / 100) * 260;
                    return `${x},${y}`;
                  }).join(" ")}
                />
                {model.history.map((entry, index) => {
                  const x = model.history.length === 1 ? 500 : (index / (model.history.length - 1)) * 1000;
                  const y = 260 - (entry.score / 100) * 260;
                  return (
                    <g key={entry.month}>
                      <circle cx={x} cy={y} r="12" fill="#0d604d" />
                      <text x={x} y={Math.max(20, y - 18)} textAnchor="middle" fontSize="24" fontWeight="700" fill="#0d604d">{entry.score}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="absolute inset-x-12 bottom-3 flex justify-between gap-2 text-[9px] font-semibold text-slate-600" dir="ltr">
                {model.history.map((entry) => <span key={entry.month}>{entry.month}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* 4. نسب امتثال الأقسام */}
        {model.result?.sections && model.result.sections.length > 0 && (
          <div data-report-block className="rounded-xl border border-border p-4 bg-muted/20">
            <h3 className="text-xs font-bold text-primary mb-3 flex items-center gap-1.5">
              <FileText className="size-4" /> ملخص نسب امتثال الأقسام
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {model.result.sections.map((sec) => {
                const secRate = Number(sec.percentage);
                const cleanRate = Number.isFinite(secRate) ? Math.round(secRate) : 0;

                return (
                  <div
                    key={sec.id}
                    className="flex justify-between items-center p-2 rounded bg-background border border-border/60"
                  >
                    <span className="font-semibold">{sec.nameAr}</span>
                    <span
                      className={`font-bold font-mono px-1.5 py-0.5 rounded text-[11px] ${cleanRate >= 85
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-destructive/10 text-destructive"
                        }`}
                    >
                      {cleanRate}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ================= الصفحة الثانية: تفاصيل بنود عدم المطابقة (بدون صور) ================= */}
      <div data-report-page className="bg-white p-6 mb-8 rounded-2xl border border-border shadow-xs space-y-4">
        <div data-report-block className="border-b border-border pb-2 flex justify-between items-center">
          <h2 className="text-base font-bold text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5" />
            تفاصيل بنود عدم المطابقة والخصومات ({model.ncrs?.length ?? 0} بند)
          </h2>
          <span className="text-xs text-muted-foreground">البنود المخصومة والملاحظات المسجلة فقط</span>
        </div>

        {!model.ncrs || model.ncrs.length === 0 ? (
          <div data-report-block className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-900">
            <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-2" />
            <p className="font-bold">لا توجد أي حالات عدم مطابقة أو بنود مخصومة في هذا الفحص.</p>
          </div>
        ) : (
          model.ncrs.map((ncr) => (
            <div
              key={ncr.id}
              data-report-block
              className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-muted px-2 py-0.5 rounded border border-border">
                    {ncr.itemId}
                  </span>
                  <span className="font-bold text-xs text-primary">{ncr.sectionName}</span>
                  <span className="text-xs text-muted-foreground">• {ncr.headerLabel}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">
                    الدرجة: {ncr.earnedScore} / {ncr.maxScore}
                  </span>
                  <span className="font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
                    خصم -{ncr.deductionPoints}
                  </span>
                </div>
              </div>

              <p className="text-xs font-semibold text-foreground/90 leading-relaxed">
                {ncr.questionText}
              </p>

              {/* الملاحظة المكتوبة فقط (بدون صور) */}
              {ncr.comment && (
                <div className="rounded-lg bg-amber-500/10 p-2.5 border border-amber-500/20 text-xs">
                  <span className="font-bold text-amber-900 block mb-0.5">الملاحظة المسجلة:</span>
                  <p className="text-foreground leading-relaxed font-medium">{ncr.comment}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ================= الصفحة الثالثة: ملحق الصور التوثيقية الشامل والتوقيعات ================= */}
      {model.allPhotos && model.allPhotos.length > 0 && (
        <div data-report-page className="bg-white p-6 rounded-2xl border border-border shadow-xs space-y-4">
          <div data-report-block className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-base font-black text-foreground flex items-center gap-2">
              <ImageIcon className="size-5 text-primary" />
              ملحق توثيق الصور والملاحظات الميدانية (إجمالي {model.allPhotos.length} صورة)
            </h2>
            <span className="text-xs text-muted-foreground font-semibold">توثيق شامل</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {model.allPhotos.map((item, idx) => (
              <div
                key={item.photoId || idx}
                data-report-block
                className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-2"
              >
                <div className="relative h-52 w-full overflow-hidden rounded-lg border border-border/80 bg-muted/40">
                  <img
                    src={item.url}
                    alt={item.questionText}
                    className="size-full object-contain"
                  />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
                      {item.itemId}
                    </span>
                    <span className="font-bold text-foreground text-[11px]">{item.sectionName}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] line-clamp-2">
                    {item.questionText}
                  </p>
                  {item.comment && (
                    <div className="rounded bg-muted/50 p-1.5 text-[11px] border border-border/60">
                      <strong className="text-destructive">الملاحظة: </strong>
                      <span className="text-foreground">{item.comment}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* التوقيعات الرسمية */}
          <div data-report-block className="mt-8 pt-4 border-t border-border grid grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <span className="block font-bold text-foreground">توقيع مفتش الجودة:</span>
              <p className="mt-4 border-b border-dashed border-border/80 w-48 pb-1">
                {model.auditorName || "—"}
              </p>
            </div>
            <div>
              <span className="block font-bold text-foreground">توقيع واستلام مدير الفرع:</span>
              <p className="mt-4 border-b border-dashed border-border/80 w-48 pb-1">
                {model.branchManager || "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* التوقيعات في حال عدم وجود صور */}
      {(!model.allPhotos || model.allPhotos.length === 0) && (
        <div data-report-block className="bg-white p-6 rounded-2xl border border-border shadow-xs mt-4">
          <div className="grid grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <span className="block font-bold text-foreground">توقيع مفتش الجودة:</span>
              <p className="mt-4 border-b border-dashed border-border/80 w-48 pb-1">
                {model.auditorName || "—"}
              </p>
            </div>
            <div>
              <span className="block font-bold text-foreground">توقيع واستلام مدير الفرع:</span>
              <p className="mt-4 border-b border-dashed border-border/80 w-48 pb-1">
                {model.branchManager || "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

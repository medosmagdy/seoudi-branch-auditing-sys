import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ImageLightbox";
import { supabase } from "@/integrations/supabase/client";
import {
  evaluateSlaughter,
  pieces,
  slaughterWarnings,
  type SlaughterInput,
} from "@/lib/slaughter-evaluation";
import { slaughterView, type SlaughterReport } from "@/lib/slaughter-model";
import { downloadElementAsPdf } from "@/lib/export-pdf";
export const amount = (value: number | null | undefined, suffix = "") =>
  value == null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
const percent = (v: number | null) => (v === null ? "—" : amount(v * 100, "%"));
export function SlaughterMetrics({ input }: { input: SlaughterInput }) {
  const result = useMemo(() => evaluateSlaughter(input), [input]),
    m = result.metrics;
  const rows = [
    ...result.sectionScores.map((s) => ({
      label: s.title,
      value: `${amount(s.degree)} / ${s.maximum}`,
    })),
    { label: "التقييم النهائي", value: amount(result.score, "%") },
    { label: "AM & PM examination", value: percent(m.examination) },
    { label: "نسبة التصافي Dressing", value: percent(m.dressing) },
    { label: "فقد النقل", value: amount(m.transportationLoss, " كجم") },
    { label: "نسبة فقد النقل", value: percent(m.transportationLossRate) },
    { label: "المرفوض", value: String(m.rejected) },
    { label: "نسبة القبول الاستثنائي من المستلم", value: percent(m.exceptionRate) },
    { label: "متوسط وزن المزرعة / العدد الكلي", value: amount(m.averageFarmWeight, " كجم") },
    { label: "متوسط وزن الاستلام / العدد الكلي", value: amount(m.averageReceivingWeight, " كجم") },
    { label: "متوسط وزن المرفوض / المرفوض", value: amount(m.averageRejectedWeight, " كجم") },
    { label: "متوسط وزن الذبائح / المستلم", value: amount(m.averageCarcassWeight, " كجم") },
    { label: "متوسط الدهون / المستلم", value: amount(m.averageFatWeight, " كجم") },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <div className="rounded-lg border bg-muted/20 p-3" key={r.label}>
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function SlaughterDailyReport({
  report,
  onExcel,
}: {
  report: SlaughterReport;
  onExcel: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const d = report.details,
    view = slaughterView(report);
  const photos = useQuery({
    queryKey: ["slaughter-report-photos", report.id],
    queryFn: async () => {
      if (String(report.id).startsWith("archive-")) return [];
      const { data, error } = await (supabase as any)
        .from("slaughter_report_photos")
        .select("id,storage_path,file_name")
        .eq("report_id", report.id)
        .order("created_at");
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (photo: { id: string; storage_path: string; file_name: string }) => {
          const result = await supabase.storage
            .from("audit-reports")
            .createSignedUrl(photo.storage_path, 3600);
          if (result.error) throw result.error;
          return { id: photo.id, url: result.data.signedUrl, name: photo.file_name };
        }),
      );
    },
    refetchOnWindowFocus: false,
  });
  const pdf = async () => {
    if (!printRef.current) return;
    setBusy(true);
    setError("");
    try {
      await downloadElementAsPdf(printRef.current, `Slaughtering-${report.date}-${report.id}`);
    } catch {
      setError("تعذر تجهيز PDF. أعد المحاولة بعد تحميل الصور.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onExcel}>
          تصدير Excel اليومي
        </Button>
        <Button
          disabled={busy || photos.isFetching || photos.isPending || photos.isError}
          onClick={() => void pdf()}
        >
          {busy ? "جاري تجهيز PDF…" : "تنزيل التقرير اليومي PDF"}
        </Button>
        {photos.isError && (
          <Button variant="outline" onClick={() => void photos.refetch()}>
            إعادة تحميل الصور
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {photos.isError && (
        <p role="alert" className="text-sm text-destructive">
          تعذر تحميل صور هذا التقرير؛ تصدير PDF متوقف لحين إعادة المحاولة.
        </p>
      )}
      <div ref={printRef} className="space-y-5 bg-white p-5 text-slate-900" dir="rtl">
        <header className="space-y-1 border-b pb-3">
          <h2 className="text-xl font-bold">تقرير الذبح اليومي — {report.date}</h2>
          <p className="text-xs">Quality Assurance · Slaughtering Checklist · QP-23-FM-01</p>
          <p className="text-xs">
            معرّف التقرير: {report.id} · الحالة: {report.status}
          </p>
        </header>
        <section data-report-block>
          <h3 className="mb-3 font-bold">معلومات الزيارة</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "المزرعة", value: report.farm },
              { label: "المجزر", value: report.slaughterhouse },
              { label: "نوع الحيوان", value: report.animalType },
              { label: "السلالة", value: view.breed },
              { label: "الهجري", value: view.hijriDate },
              { label: "الموسم", value: view.season },
              { label: "العدد الكلي", value: report.number },
              { label: "المستلم", value: report.received },
              { label: "المرفوض", value: report.rejected },
              { label: "سبب الرفض", value: report.rejectionReasons },
              { label: "وزن المزرعة كجم", value: amount(view.farmWeight) },
              { label: "وزن الاستلام كجم", value: amount(view.receivingWeight) },
              { label: "وزن الذبائح كجم", value: amount(view.carcassWeight) },
              { label: "وزن الدهون كجم", value: amount(view.fatWeight) },
              { label: "المقبول استثنائيًا", value: amount(view.acceptedException) },
              ...(d?.version === 2
                ? [
                    { label: "موقع المزرعة", value: d.input.farmLocation },
                    { label: "موقع المجزر", value: d.input.slaughterhouseLocation },
                    { label: "مدة الرحلة", value: d.input.tripDuration },
                    { label: "وزن المرفوض كجم", value: amount(d.input.rejectedWeight) },
                    { label: "وزن الإعدامات كجم", value: amount(d.input.condemnationWeight) },
                    {
                      label: "مصدر الأوزان",
                      value:
                        d.input.weightSource === "estimated"
                          ? `تقدير: ${d.input.weightSourceNote}`
                          : "مقاس",
                    },
                  ]
                : []),
            ].map((r) => (
              <div className="rounded border p-2" key={r.label}>
                <dt className="text-xs text-slate-500">{r.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold">
                  {r.value ?? "غير مسجل"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {d?.version === 2 ? (
          <>
            <section data-report-block>
              <h3 className="mb-3 font-bold">مؤشرات الزيارة</h3>
              <SlaughterMetrics input={d.input} />
              {slaughterWarnings(d.input).map((text) => (
                <p className="mt-2 rounded border p-2 text-xs" key={text}>
                  {text}
                </p>
              ))}
            </section>
            <section data-report-block>
              <h3 className="mb-3 font-bold">سيارات النقل المبرد</h3>
              <table className="w-full text-right text-sm">
                <thead>
                  <tr>
                    <th className="border p-2">رقم السيارة</th>
                    <th className="border p-2">حرارة المغادرة °C</th>
                  </tr>
                </thead>
                <tbody>
                  {d.input.trucks.map((truck, index) => (
                    <tr data-report-block key={index}>
                      <td className="border p-2">{truck.number}</td>
                      <td className="border p-2">{amount(truck.temperature)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.input.trucks.length && <p className="text-xs">لا توجد سيارات مسجلة.</p>}
            </section>
            <section data-report-block>
              <h3 className="mb-3 font-bold">ملاحظات الذبح المهمة</h3>
              {(
                [
                  ["rejection", "الرفض"],
                  ["trimming", "التشذيب"],
                  ["condemnation", "الإعدامات"],
                ] as const
              ).map(([key, label]) => (
                <div className="mb-2 rounded border p-3" key={key}>
                  <h4 className="text-sm font-bold">{label}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {d.input.importantNotes[key] || "لا توجد ملاحظات مسجلة"}
                  </p>
                </div>
              ))}
            </section>
            <section data-report-block>
              {d.input.observations && (
                <dl className="mb-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(d.input.observations)
                    .filter(([, value]) => value.trim())
                    .map(([key, value]) => (
                      <div className="rounded border p-2 text-xs" key={key}>
                        <dt>
                          {
                            (
                              {
                                cuttingLegLigaments: "قطع أربطة الأرجل",
                                heterogeneousSelection: "عدم تجانس الاختيار",
                                badStamping: "مشاكل الختم",
                                bruises: "تفاصيل الكدمات",
                                overCapacityRoughHandling: "زيادة الحمولة والتعامل العنيف",
                              } as Record<string, string>
                            )[key]
                          }
                        </dt>
                        <dd className="mt-1">{value}</dd>
                      </div>
                    ))}
                </dl>
              )}
              <h3 className="mb-3 font-bold">تفاصيل الحالات</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr>
                      {[
                        "النوع",
                        "الحالة",
                        "الكمية",
                        "الوحدة",
                        "مكافئ القطع",
                        "الحيوانات المتأثرة",
                        "الوزن كجم",
                        "السبب",
                      ].map((h) => (
                        <th className="border p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.input.cases.map((item, index) => (
                      <tr data-report-block key={index}>
                        <td className="border p-2">
                          {
                            { rejection: "رفض", trimming: "تشذيب", condemnation: "إعدام" }[
                              item.kind
                            ]
                          }
                        </td>
                        <td className="border p-2">{item.item}</td>
                        <td className="border p-2">{amount(item.quantity)}</td>
                        <td className="border p-2">
                          {
                            {
                              piece: "قطعة",
                              pair: "زوج",
                              animal: "حيوان",
                              carcass: "ذبيحة",
                              kg: "كجم",
                            }[item.unit]
                          }
                        </td>
                        <td className="border p-2">{amount(pieces(item.quantity, item.unit))}</td>
                        <td className="border p-2">{amount(item.affectedAnimals)}</td>
                        <td className="border p-2">{amount(item.weight)}</td>
                        <td className="border p-2">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <p className="rounded border p-3 text-sm">
            تقرير قديم: الأرقام والدرجات معروضة كما حُفظت، ولم تُعد حساباتها بالقواعد الجديدة.
            التفاصيل غير الموجودة لا تُستنتج.
          </p>
        )}
        {d && (
          <section data-report-block>
            <h3 className="mb-3 font-bold">Meat quality checklist</h3>
            <table className="w-full text-right text-xs">
              <thead>
                <tr>
                  {["القسم", "البند", "القصوى", "عدم المطابقة / حيوانات", "الدرجة", "الملاحظة"].map(
                    (h) => (
                      <th className="border p-2" key={h}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(d.version === 2 ? d.evaluation.checklist : d.checklist).map((row) => (
                  <tr data-report-block key={`${row.section}-${row.item}`}>
                    <td className="border p-2">{row.section}</td>
                    <td className="border p-2">{row.item}</td>
                    <td className="border p-2">{row.maximum}</td>
                    <td className="border p-2">{amount(row.nonconformity)}</td>
                    <td className="border p-2">{amount(row.degree)}</td>
                    <td className="border p-2">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section data-report-block>
          <h3 className="mb-3 font-bold">الصور المرتبطة بهذا التقرير</h3>
          {photos.isPending && <p>جاري التحميل…</p>}
          <div className="grid grid-cols-2 gap-3">
            {photos.data?.map((photo) => (
              <div key={photo.id}>
                <ImageLightbox
                  src={photo.url}
                  alt={photo.name}
                  imageClassName="max-h-80 w-full rounded border object-contain"
                />
                <p className="mt-1 text-xs">{photo.name}</p>
              </div>
            ))}
          </div>
          {photos.data?.length === 0 && <p className="text-xs">لا توجد صور مرتبطة بالتقرير.</p>}
        </section>
      </div>
    </div>
  );
}

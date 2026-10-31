import { findingStatuses, severities, metrics, type MaintenanceReport } from "@/lib/maintenance";
export function MaintenancePdfDocument({
  report,
  branch,
  urls,
  branchManager,
  areaManager,
  scope,
}: {
  report: MaintenanceReport;
  branch: string;
  urls: Record<string, string>;
  branchManager: string;
  areaManager: string;
  scope: string;
}) {
  const m = metrics(report.findings),
    open = report.findings.filter((f) => f.status === "open").length,
    newCount = report.findings.filter((f) => f.status === "new").length,
    progress = report.findings.filter((f) => f.status === "in_progress").length;
  return (
    <div
      dir="rtl"
      className="bg-white text-slate-900"
      style={{ width: 900, padding: 32, fontFamily: "Arial, sans-serif" }}
    >
      <section data-report-page className="bg-white" style={{ minHeight: 1080, padding: 28 }}>
        <header data-report-block className="rounded-2xl bg-emerald-900 p-8 text-white">
          <p className="text-sm">Seoudi Quality Operating Platform</p>
          <h1 className="mt-3 text-3xl font-bold">تقرير مراجعة الصيانة</h1>
          <p className="mt-2 text-lg">{branch}</p>
        </header>
        <div data-report-block className="mt-7 rounded-xl border border-emerald-100 p-6">
          <h2 className="mb-5 text-xl font-bold text-emerald-900">بيانات التقرير</h2>
          <div className="grid grid-cols-2 gap-5 text-base">
            {[
              ["الفرع", branch],
              ["تاريخ الفحص", report.inspection_date],
              ["المراجع", report.reviewer],
              ["مدير الفرع", branchManager || "غير محدد"],
              ["مدير منطقة الصيانة", areaManager || "غير محدد"],
              ["الحالة", report.status === "draft" ? "مسودة" : "معتمد"],
              ["نطاق التصدير", scope],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 font-bold">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div data-report-block className="mt-7">
          <h2 className="mb-4 text-xl font-bold text-emerald-900">مؤشرات الملاحظات المعروضة</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              ["إجمالي الملاحظات", m.total],
              ["تم", m.resolved],
              ["لم يتم", open],
              ["نسبة الإغلاق", m.rate === null ? "—" : m.rate.toFixed(1) + "%"],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"
              >
                <p className="text-sm text-slate-600">{label}</p>
                <strong className="mt-2 block text-2xl text-emerald-900">{value}</strong>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">
            جديد: {newCount} · قيد التنفيذ: {progress} · إجمالي غير المغلق: {m.open}
          </p>
        </div>
      </section>
      {Array.from({ length: Math.ceil(report.findings.length / 2) }, (_, group) => (
        <section key={group} data-report-page className="space-y-4 bg-white p-5">
          <header data-report-block className="border-b-2 border-emerald-800 pb-3">
            <h2 className="text-xl font-bold text-emerald-900">ملاحظات الصيانة — {branch}</h2>
            <p className="mt-1 text-sm text-slate-600">
              تاريخ الفحص: {report.inspection_date} · {scope}
            </p>
          </header>
          {report.findings.slice(group * 2, group * 2 + 2).map((f, i) => (
            <article
              key={f.id}
              data-report-block
              className="rounded-xl border border-slate-200 p-5"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {f.section} · ملاحظة {group * 2 + i + 1}
                  </p>
                  <h3 className="mt-2 whitespace-pre-wrap text-lg font-bold">{f.description}</h3>
                </div>
                <div className="shrink-0 text-sm">
                  <p>الحالة: {findingStatuses[f.status]}</p>
                  <p className="mt-1">الخطورة: {severities[f.severity]}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <p>تاريخ العطل: {f.initial_history || "—"}</p>
                <p>مسؤول التنفيذ: {f.assigned_to || "—"}</p>
                <p>موعد الإغلاق: {f.due_date || "—"}</p>
                {f.corrective_action && (
                  <p className="whitespace-pre-wrap">الإجراء التصحيحي: {f.corrective_action}</p>
                )}
                {f.evidence && <p className="whitespace-pre-wrap">الأدلة: {f.evidence}</p>}
                {f.comments && <p className="whitespace-pre-wrap">التعليقات: {f.comments}</p>}
              </div>
              {f.photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {f.photos.map((path, n) => (
                    <img
                      key={path}
                      src={urls[path]}
                      alt={`صورة ${n + 1} للملاحظة`}
                      style={{
                        width: 175,
                        height: 145,
                        objectFit: "contain",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { includesDeliveryInOverall } from "@/lib/scoring";
import type { ReportModel } from "@/lib/report-data";

export function AuditSummaryScores({ model, canEdit }: { model: ReportModel; canEdit: boolean }) {
  const { result } = model;
  const deliveryIncluded = includesDeliveryInOverall(model.branchName);
  return (
    <div className="summary-overview space-y-6" dir="rtl">
      <section aria-label="نتيجة الفحص" className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">النسبة قبل الخصم العام</p>
          <p className="mt-3 text-3xl font-extrabold tabular-nums">{result.overallPercentage}%</p>
          <p className="mt-2 text-xs text-muted-foreground">بعد تطبيق خصومات الأقسام</p>
        </div>
        <div className="surface-card p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">الخصومات العامة</p>
          <p className="mt-3 text-3xl font-extrabold text-destructive tabular-nums">
            {result.generalDeductionPercentage}%
          </p>
          <p className="mt-2 text-xs text-muted-foreground">تُخصم من النسبة الإجمالية</p>
        </div>
        <div className="summary-final-score rounded-2xl border p-5 sm:p-6">
          <p className="text-sm opacity-90">النتيجة النهائية</p>
          <p className="mt-3 text-4xl font-extrabold tabular-nums">{result.finalPercentage}%</p>
          <p className="mt-2 text-xs opacity-90">بعد جميع الخصومات</p>
        </div>
      </section>
      <section className="surface-card overflow-hidden" aria-labelledby="summary-sections-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5 sm:p-6">
          <div>
            <h2 id="summary-sections-title" className="font-bold">
              نتائج الأقسام
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              راجع درجة كل قسم وخصمه، وافتح القسم لمراجعة البنود.
            </p>
          </div>
          <Badge variant="outline">{result.sections.length} أقسام</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead>
              <tr>
                <th className="p-4">القسم</th>
                <th className="p-4">الدرجة بعد خصم القسم</th>
                <th className="p-4">خصم القسم</th>
                <th className="p-4">النسبة</th>
                <th className="p-4">
                  <span className="sr-only">الإجراء</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.sections.map((entry, index) => (
                <tr key={entry.sectionId} className="border-t border-border">
                  <td className="p-4">
                    <Link
                      to="/audits/$id"
                      params={{ id: model.auditId }}
                      search={{ section: index }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {entry.nameAr}
                    </Link>
                    {entry.isDelivery && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {deliveryIncluded
                          ? "التوصيل مشمول في النتيجة النهائية"
                          : "التوصيل: تقييم منفصل عن النتيجة النهائية"}
                      </p>
                    )}
                  </td>
                  <td className="p-4 tabular-nums">
                    {entry.excluded ? (
                      <Badge variant="outline">غير منطبق N/A</Badge>
                    ) : (
                      <span dir="ltr">
                        {entry.finalScore} / {entry.max}
                      </span>
                    )}
                  </td>
                  <td className="p-4 tabular-nums text-destructive">
                    {entry.excluded ? "—" : `${entry.deductionPercentage}%`}
                  </td>
                  <td className="p-4 font-bold tabular-nums">
                    {entry.excluded ? "—" : `${entry.percentage}%`}
                  </td>
                  <td className="p-4 text-left">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/audits/$id"
                        params={{ id: model.auditId }}
                        search={{ section: index }}
                      >
                        {canEdit ? "مراجعة القسم" : "عرض القسم"}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

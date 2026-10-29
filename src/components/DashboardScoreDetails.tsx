import { useEffect, useState } from "react";
import type { aggregateDashboard } from "@/lib/dashboard/snapshot";
import { DashboardFilterBar, type DashboardFilterBarProps } from "./DashboardFilterBar";
import { Button } from "@/components/ui/button";

type Summary = ReturnType<typeof aggregateDashboard>;
const percentage = (value: number | null) =>
  value === null ? "—" : `${Number(value.toFixed(2))}%`;
const points = (value: number | null) =>
  value === null ? "—" : `${Number(value.toFixed(2))} نقطة مئوية`;
export function DashboardScoreDetails({
  summary,
  filters,
}: {
  summary: Summary;
  filters: DashboardFilterBarProps;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [filters.branch, filters.fromMonth, filters.toMonth, filters.program]);
  const rows = summary.rows.filter((row) => row.after !== null || row.missing.length);
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className="space-y-4 pt-3" dir="rtl">
      <DashboardFilterBar {...filters} />
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-bold">
          متوسط الفروع: قبل {percentage(summary.before)} · بعد {percentage(summary.after)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {summary.provisional
            ? "مؤشر مبدئي من المتاح؛ تكتمل أوزان الشهر عند تسجيل الأوديتس المطلوبة."
            : "مؤشر الأوديتس المختارة."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          قبل: قبل جميع الخصومات. بعد: بعد خصومات الأقسام والخصم العام. الفروع والشهور متساوية
          الوزن؛ الفترات بلا فحوصات لا تدخل المتوسط.
        </p>
      </div>
      {rows.slice(currentPage * 6, currentPage * 6 + 6).map((row) => (
        <section key={`${row.branchId}-${row.month}`} className="rounded-xl border p-3">
          <h3 className="text-sm font-bold">
            {row.branchName} · {row.month}
          </h3>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[480px] text-right text-xs">
              <thead>
                <tr>
                  <th className="p-2">البرنامج</th>
                  <th className="p-2">طريقة التجميع</th>
                  <th className="p-2">قبل</th>
                  <th className="p-2">بعد</th>
                  <th className="p-2">الزيارات</th>
                </tr>
              </thead>
              <tbody>
                {(["FS", "GHP", "FSMS"] as const)
                  .filter((program) => filters.program === "all" || filters.program === program)
                  .map((program) => {
                    const score = row.programs[program];
                    return (
                      <tr key={program} className="border-t">
                        <td className="p-2 font-semibold">{program}</td>
                        <td className="p-2">
                          {filters.program !== "all"
                            ? "بدون أوزان"
                            : row.weights[program] === 0
                              ? "خارج وزن الشهر"
                              : row.provisional
                                ? "متوسط المتاح"
                                : `${row.weights[program] * 100}%`}
                        </td>
                        <td className="p-2">{percentage(score?.before ?? null)}</td>
                        <td className="p-2">{score ? percentage(score.after) : "لم يُسجل"}</td>
                        <td className="p-2">{score?.visits ?? 0}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs font-semibold">
            قبل {percentage(row.before)} · بعد {percentage(row.after)}{" "}
            {row.provisional ? "— مؤشر مبدئي" : ""}
          </p>
          {!!row.missing.length && (
            <p className="mt-1 text-xs text-muted-foreground">لم يُسجل: {row.missing.join("، ")}</p>
          )}
        </section>
      ))}
      {!rows.length && <p className="text-sm">لا توجد نتائج مطابقة.</p>}
      <div className="flex items-center justify-between text-xs">
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          السابق
        </Button>
        <span>
          {currentPage + 1} / {pages} · {rows.length} تقييم فرع/شهر
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={currentPage >= pages - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          التالي
        </Button>
      </div>
      <section className="rounded-xl border bg-muted/20 p-4 text-sm">
        <h3 className="font-bold">تأثير الخصومات على متوسط الفروع</h3>
        <p className="mt-2">
          خصومات الأقسام:{" "}
          {summary.sectionDeduction === null
            ? "لا توجد بيانات"
            : `−${points(summary.sectionDeduction)}`}
        </p>
        <p className="mt-1">
          الخصومات العامة:{" "}
          {summary.generalDeduction === null
            ? "لا توجد بيانات"
            : `−${points(summary.generalDeduction)}`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          تأثير فعلي في النتيجة بنفس طريقة التجميع، وليس جمع نسب الخصم المسجلة. قبل − خصومات الأقسام
          − الخصومات العامة = بعد، مع فروق التقريب.
        </p>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { aggregateDashboard } from "@/lib/dashboard/snapshot";
import { Button } from "@/components/ui/button";
import { DashboardFilterBar, type DashboardFilterBarProps } from "./DashboardFilterBar";
export function DashboardRanking({
  summary,
  filters,
}: {
  summary: ReturnType<typeof aggregateDashboard>;
  filters: DashboardFilterBarProps;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [filters.branch, filters.fromMonth, filters.toMonth, filters.program]);
  const rows = summary.ranking;
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  return (
    <section
      className="dashboard-panel dashboard-ranking surface-card mt-6 rounded-xl border p-4"
      dir="rtl"
    >
      <h2 className="font-bold">ترتيب الفروع حسب الفحوصات المتاحة</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        حسب نفس فلاتر الشهر والفرع والبرنامج. الترتيب بمتوسط الزيارات المعتمدة بعد الخصومات، بدون
        أوزان الأوديتس. عدد الزيارات ظاهر للمقارنة.
      </p>
      <div className="my-3">
        <DashboardFilterBar {...filters} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-right text-sm">
          <thead>
            <tr>
              <th className="p-2">الترتيب</th>
              <th className="p-2">الفرع</th>
              <th className="p-2">قبل</th>
              <th className="p-2">بعد</th>
              <th className="p-2">الزيارات</th>
              <th className="p-2">الأوديتس المتاحة</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 10, current * 10 + 10).map((row) => (
              <tr key={row.branchId} className="border-t">
                <td className="p-2">{row.rank ?? "—"}</td>
                <td className="p-2 font-semibold">{row.branchName}</td>
                <td className="p-2">{row.score ? `${row.score.before}%` : "—"}</td>
                <td className="p-2 font-bold">
                  {row.score ? `${row.score.after}%` : "لا توجد فحوصات"}
                </td>
                <td className="p-2">{row.visits}</td>
                <td className="p-2">{row.programs.join("، ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="py-4 text-sm">لا توجد فروع مطابقة.</p>}
      <div className="mt-3 flex items-center justify-between text-xs">
        <Button
          size="sm"
          variant="outline"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          السابق
        </Button>
        <span>
          {current + 1} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={current === pages - 1}
          onClick={() => setPage(current + 1)}
        >
          التالي
        </Button>
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import {
  aggregateSlaughter,
  aggregateRejectionCases,
  type SlaughterReport,
} from "@/lib/slaughter-model";
import { amount } from "./SlaughterDailyReport";
export function SlaughterAnalytics({ reports }: { reports: SlaughterReport[] }) {
  const [group, setGroup] = useState<"farm" | "animalType" | "year" | "month" | "season">("farm"),
    [page, setPage] = useState(0);
  const rows = useMemo(() => aggregateSlaughter(reports, group), [reports, group]);
  const rejectionCases = useMemo(() => aggregateRejectionCases(reports), [reports]);
  const pages = Math.max(1, Math.ceil(rows.length / 15)),
    current = Math.min(page, pages - 1);
  return (
    <section className="space-y-3 rounded-xl border p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold">التجميعات حسب الفلاتر المختارة</h3>
        <label className="text-xs">
          تجميع حسب
          <select
            className="mx-2 h-9 rounded border bg-background px-2"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value as typeof group);
              setPage(0);
            }}
          >
            {[
              ["farm", "المزرعة"],
              ["animalType", "النوع"],
              ["year", "السنة"],
              ["month", "الشهر"],
              ["season", "الموسم"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-right text-xs">
          <thead>
            <tr>
              {[
                "المجموعة",
                "التقارير",
                "العدد",
                "المستلم",
                "المرفوض",
                "نسبة الرفض",
                "متوسط التقييم / تقارير محتسبة",
                "وزن الذبائح كجم",
              ].map((h) => (
                <th className="p-2" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 15, current * 15 + 15).map((r) => (
              <tr className="border-t" key={r.key}>
                <td className="p-2 font-semibold">{r.key}</td>
                <td>{r.reports}</td>
                <td>{r.number}</td>
                <td>{r.received}</td>
                <td>{r.rejected}</td>
                <td>{amount(r.rejectionRate === null ? null : r.rejectionRate * 100, "%")}</td>
                <td>
                  {amount(r.score, "%")} / {r.scoredReports}
                </td>
                <td>{amount(r.carcassWeight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        نسبة الرفض = مجموع المرفوض ÷ مجموع العدد. متوسط التقييم للتقارير التي لها نتيجة فقط؛ الأوزان
        الناقصة تظهر — ولا تُحسب كصفر.
      </p>
      {!!rejectionCases.length && (
        <section className="space-y-2">
          <h4 className="font-semibold">تصنيف حالات الرفض المسجلة بالتفصيل</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr>
                  {[
                    "المزرعة",
                    "تصنيف السبب",
                    "مرحلة الرفض",
                    "تقارير مختلفة",
                    "سطور الحالات",
                    "الحيوانات بالحالات",
                  ].map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rejectionCases.map((row) => (
                  <tr className="border-t" key={`${row.farm}-${row.category}-${row.stage}`}>
                    <td className="p-2">{row.farm}</td>
                    <td>
                      {{
                        parasitic: "طفيلي",
                        viral: "فيروسي",
                        tb: "TB",
                        managemental: "إداري/ممارسات",
                        other: "أخرى",
                      }[row.category] ?? row.category}
                    </td>
                    <td>
                      {{ live: "حي", carcass: "ذبيحة", unspecified: "غير محدد" }[row.stage] ??
                        row.stage}
                    </td>
                    <td>{row.reports}</td>
                    <td>{row.cases}</td>
                    <td>{amount(row.affectedAnimals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            هذه أعداد الحالات المفصلة فقط، وقد تتداخل أسباب الحيوان نفسه؛ لا تُجمع كبديل لإجمالي
            المرفوض. التقارير القديمة بلا تصنيف منظم لا تُخمّن أسبابها.
          </p>
        </section>
      )}
      {pages > 1 && (
        <div className="flex justify-between">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            السابق
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            التالي
          </button>
        </div>
      )}
    </section>
  );
}

import { forwardRef } from "react";
import type { NcrAudit, NcrBranch, NcrFilters, summarizeNcr } from "@/lib/ncr-management";

type Summary = ReturnType<typeof summarizeNcr>;
export const ncrProgramLabel = { both: "FS + GHP", FS: "FS", GHP: "GHP" };
export const scoreLabel = (score: number | null) => (score === null ? "—" : `${score}%`);

export const NcrAnalysisReport = forwardRef<
  HTMLDivElement,
  {
    branch: NcrBranch;
    filters: NcrFilters;
    summary: Summary;
    audits: NcrAudit[];
    unresolved: number;
  }
>(function NcrAnalysisReport({ branch, filters, summary, audits, unresolved }, ref) {
  const { overall, priorities, repeated, byProgram, sections } = summary;
  return (
    <div
      ref={ref}
      dir="rtl"
      lang="ar"
      className="w-[790px] bg-white p-8 text-[#17372c]"
      style={{ fontFamily: "Arial, Tahoma, sans-serif" }}
    >
      <header data-report-block className="border-b-2 border-[#246b54] pb-4">
        <p className="text-xs font-semibold">SQOP · NCRs Management</p>
        <h1 className="mt-2 text-2xl font-bold">تحليل عدم المطابقة · {branch.name}</h1>
        <p className="mt-1 text-sm">
          الفترة{" "}
          <bdi>
            {filters.start} → {filters.end}
          </bdi>{" "}
          • <bdi>{ncrProgramLabel[filters.program]}</bdi> • الأوديتات المعتمدة المسموح بعرضها
        </p>
      </header>
      <div data-report-block className="my-5 grid grid-cols-4 gap-3">
        {[
          ["أوديت معتمد", overall.visits],
          ["متوسط الدرجة", scoreLabel(overall.average)],
          ["حالة عدم مطابقة", overall.findings],
          ["نمط متكرر", repeated.length],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-[#d6e5de] bg-[#f2f8f5] p-3" key={label}>
            <div className="text-xl font-bold">
              <bdi>{value}</bdi>
            </div>
            <p className="text-xs">{label}</p>
          </div>
        ))}
      </div>
      <section data-report-block className="my-4 rounded-lg border p-3 text-sm">
        <h2 className="mb-2 font-bold">حالة الفرع خلال الفترة</h2>
        <p>
          {overall.visits
            ? overall.findings
              ? `اتسجلت ${overall.findings} حالة عدم مطابقة، منها ${overall.zero} بدرجة صفر. ${sections[0] ? `أكثر الأقسام تسجيلًا للحالات: ${sections[0].label} (${sections[0].count}).` : ""}`
              : "لم تُسجل بنود بدرجة أقل من الحد الأقصى في الأوديتات المشمولة."
            : "لا توجد أوديتات معتمدة في الفترة المختارة."}
        </p>
        <p className="mt-1">
          {(["FS", "GHP"] as const)
            .filter((p) => filters.program === "both" || filters.program === p)
            .map((p) => (
              <span key={p} className="me-6">
                <bdi>{p}</bdi>: {byProgram[p].visits} أوديت · متوسط{" "}
                <bdi>{scoreLabel(byProgram[p].average)}</bdi>
              </span>
            ))}
        </p>
      </section>
      {priorities.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">أولويات التحسين والمتابعة</h2>
          {priorities.map((priority) => (
            <article
              data-report-block
              key={priority.id}
              className="rounded-lg border border-[#d6e5de] px-3 py-2 text-sm leading-snug"
            >
              <h3 className="font-bold">{priority.label}</h3>
              <p className="mt-1 text-xs">
                {priority.findings.length} حالة في {priority.visits} أوديت • {priority.zero} بدرجة
                صفر
                {priority.kind === "concept" && " • تجميع حسب صياغات الملاحظات"}
              </p>
              <p className="mt-1">{priority.action}</p>
              {priority.findings.find((f) => f.observation.trim())?.observation && (
                <p className="mt-1 break-words text-xs">
                  مثال من الأوديت:{" "}
                  {priority.findings
                    .find((f) => f.observation.trim())!
                    .observation.trim()
                    .slice(0, 140)}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      {audits.length > 0 && (
        <section data-report-block className="mt-4 text-xs leading-relaxed">
          <h2 className="mb-1 font-bold">أحدث الأوديتات المرجعية</h2>
          <p>
            {audits
              .slice(0, 6)
              .map((audit) => `${audit.date} · ${audit.program} · ${scoreLabel(audit.score)}`)
              .join("  |  ")}
          </p>
          {audits.length > 6 && <p>باقي الأوديتات ومراجع البنود متاحة داخل التطبيق.</p>}
        </section>
      )}
      <footer data-report-block className="mt-4 border-t pt-3 text-xs leading-relaxed">
        عدم المطابقة هنا هو بند بدرجة مسجلة أقل من الحد الأقصى؛ البنود والأقسام غير المنطبقة
        مستبعدة. التكرار يعني الظهور في أوديتين مختلفين على الأقل. المتوسط وصفي للدرجات المعتمدة
        المسجلة، ولا يمثل درجة الداشبورد الموزونة أو دليلًا على إغلاق الحالات.
        {unresolved > 0 &&
          ` ${unresolved} بند محفوظ بدرجة ناقصة أو غير صالحة ولم يحتسب ضمن الحالات.`}
        {overall.scored < overall.visits &&
          ` متوسط الدرجة لا يشمل ${overall.visits - overall.scored} أوديت بدون نتيجة مسجلة صالحة.`}
      </footer>
    </div>
  );
});

import { forwardRef, type ReactNode } from "react";
import type { NcrAudit, NcrBranch, NcrFilters } from "@/lib/ncr-management";
import {
  ncrExcerpt,
  ncrPeriodLabel,
  ncrPriorityCoverage,
  ncrProgramLabel,
  priorityEvidence,
  scoreLabel,
  type NcrPriority,
  type NcrSummary,
} from "@/lib/ncr-presentation";
import "./ncr-analysis-report.css";

type ReportProps = {
  branch: NcrBranch;
  filters: NcrFilters;
  summary: NcrSummary;
  audits: NcrAudit[];
  unresolved: number;
};
type AuditLookup = ReadonlyMap<string, NcrAudit>;

export const NcrAnalysisReport = forwardRef<HTMLDivElement, ReportProps>(function NcrAnalysisReport(
  { branch, filters, summary, audits, unresolved },
  ref,
) {
  const { overall, priorities, repeated, byProgram, sections } = summary;
  const [first] = priorities;
  const visibleSections = sections.slice(0, 4);
  const auditById = new Map(audits.map((audit) => [audit.id, audit]));
  const hasAppendix = priorities.length > 2 || audits.length > 4;
  const totalPages = hasAppendix ? 2 : 1;
  const branchName = ncrExcerpt(branch.name, 70) || "الفرع";
  return (
    <div ref={ref} lang="ar" dir="rtl">
      <article data-report-page className="ncr-pdf">
        <header className="ncr-pdf-hero">
          <div className="ncr-pdf-hero-top">
            <div>
              <span className="ncr-pdf-kicker">ضمان الجودة · مراجعات الفروع</span>
            </div>
            <div className="ncr-pdf-brand" dir="ltr">
              SQOP<span>NCR BRIEF</span>
            </div>
          </div>
          <h1>تقرير عدم المطابقة</h1>
          <p className="ncr-pdf-branch">{branchName}</p>
          <div className="ncr-pdf-context">
            <span>{ncrPeriodLabel(filters)}</span>
            <span dir="ltr">{ncrProgramLabel[filters.program]}</span>
            <span>الأوديتات المعتمدة</span>
          </div>
        </header>

        <div className="ncr-pdf-content">
          <div className="ncr-pdf-metric-grid">
            <Metric value={overall.visits} label="أوديت معتمد" />
            <Metric value={scoreLabel(overall.average)} label="متوسط الدرجة" />
            <Metric value={overall.findings} label="حالة عدم مطابقة" alert={overall.findings > 0} />
            <Metric value={repeated.length} label="نمط متكرر" />
          </div>

          <div className="ncr-pdf-focus">
            <p className="ncr-pdf-kicker">{first ? "أولوية المتابعة" : "نظرة تنفيذية"}</p>
            <h2>
              {first
                ? ncrExcerpt(first.label, 116)
                : overall.visits
                  ? "لم تُسجّل بنود أقل من الحد الأقصى"
                  : "لا توجد أوديتات معتمدة في الفترة"}
            </h2>
            <p>
              {first
                ? `${ncrPriorityCoverage(first)}${first.zero ? `، منها ${first.zero} بدرجة صفر` : ""}. راجع المثال والإجراء المقترح في الأولوية الأولى أدناه.`
                : overall.visits
                  ? "الملخص يغطّي النتائج المسجلة فقط. راجع نطاق الأوديتات أدناه."
                  : "اختر فترة أخرى لعرض نتائج الفحوصات المتاحة."}
            </p>
          </div>

          <div className="ncr-pdf-overview">
            <section className="ncr-pdf-panel">
              <h2>أين تتركّز الحالات؟</h2>
              {!visibleSections.length && (
                <p className="ncr-pdf-small">لا توجد حالات مدرجة في الفترة.</p>
              )}
              {visibleSections.map((section) => {
                const size = (100 * section.count) / visibleSections[0]!.count;
                const zeroSize = (100 * section.zero) / section.count;
                return (
                  <div className="ncr-pdf-section-row" key={section.label}>
                    <div>
                      <span>{ncrExcerpt(section.label, 36)}</span>
                      <strong dir="ltr">{section.count}</strong>
                    </div>
                    <div className="ncr-pdf-track">
                      <div className="ncr-pdf-track-filled" style={{ width: `${size}%` }}>
                        {section.zero > 0 && <div style={{ width: `${zeroSize}%` }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {visibleSections.length > 0 && (
                <p className="ncr-pdf-legend">
                  <span /> الجزء الأحمر: بنود بدرجة صفر
                </p>
              )}
              {sections.length > visibleSections.length && (
                <p className="ncr-pdf-small">
                  معروض أعلى {visibleSections.length} أقسام حسب عدد الحالات.
                </p>
              )}
            </section>
            <section className="ncr-pdf-panel">
              <h2>قراءة النتائج حسب البرنامج</h2>
              {(["FS", "GHP"] as const)
                .filter((code) => filters.program === "both" || code === filters.program)
                .map((code) => {
                  const program = byProgram[code];
                  return (
                    <div key={code} className="ncr-pdf-program">
                      <span className="ncr-pdf-chip" dir="ltr">
                        {code}
                      </span>
                      <div>
                        <b dir="ltr">{scoreLabel(program.average)}</b>
                        <p>
                          {program.visits
                            ? `الأوديتات: ${program.visits} · الحالات: ${program.findings}`
                            : "لا توجد أوديتات معتمدة"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              <p className="ncr-pdf-small">البنود اللي حصلت على درجة صفر: {overall.zero}.</p>
            </section>
          </div>

          {priorities.length > 0 && (
            <section className="ncr-pdf-priorities">
              <SectionTitle
                title="ما المطلوب من الفرع؟"
                subtitle="إجراءات مقترحة مرتبطة بأمثلة من الأوديتات"
              />
              {priorities.slice(0, 2).map((priority, index) => (
                <ActionCard
                  key={priority.id}
                  priority={priority}
                  rank={index + 1}
                  audits={auditById}
                />
              ))}
            </section>
          )}
          {!hasAppendix && audits.length > 0 && <AuditTable audits={audits} />}
        </div>
        <ReportFooter page={1} total={totalPages} branchName={branchName}>
          {hasAppendix ? (
            "تجد بقية الأولويات والأوديتات المرجعية في الصفحة التالية."
          ) : (
            <MethodNote unresolved={unresolved} overall={overall} />
          )}
        </ReportFooter>
      </article>

      {hasAppendix && (
        <article data-report-page className="ncr-pdf">
          <header className="ncr-pdf-appendix">
            <p className="ncr-pdf-kicker">SQOP · تفاصيل المتابعة</p>
            <h1>الأدلة وخطوة المتابعة</h1>
            <p>
              {branchName} · {ncrPeriodLabel(filters)}
            </p>
          </header>
          <div className="ncr-pdf-content">
            {priorities.length > 2 && (
              <section className="ncr-pdf-priorities">
                <SectionTitle
                  title="بقية أولويات التحسين"
                  subtitle="راجع المثال ومصدره قبل تحديد الإجراء المناسب"
                />
                {priorities.slice(2).map((priority, index) => (
                  <ActionCard
                    key={priority.id}
                    priority={priority}
                    rank={index + 3}
                    audits={auditById}
                  />
                ))}
              </section>
            )}
            <AuditTable audits={audits} />
            {priorities.length > 0 && (
              <div className="ncr-pdf-followup">
                <h2>الرد المطلوب من الفرع</h2>
                <p>
                  حدّد الإجراء المخطط له لكل أولوية، والمسؤول عن التنفيذ، والموعد المتوقع. لو
                  الإجراء تم بالفعل، أرفق ما يوضح تنفيذه.
                </p>
              </div>
            )}
          </div>
          <ReportFooter page={2} total={totalPages} branchName={branchName}>
            <MethodNote unresolved={unresolved} overall={overall} />
          </ReportFooter>
        </article>
      )}
    </div>
  );
});

function Metric({
  value,
  label,
  alert,
}: {
  value: string | number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className={alert ? "ncr-pdf-metric ncr-pdf-metric-alert" : "ncr-pdf-metric"}>
      <strong dir="ltr">{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="ncr-pdf-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function ActionCard({
  priority,
  rank,
  audits,
}: {
  priority: NcrPriority;
  rank: number;
  audits: AuditLookup;
}) {
  const evidence = priorityEvidence(priority);
  const audit = evidence ? audits.get(evidence.auditId) : undefined;
  return (
    <section className="ncr-pdf-action">
      <span className="ncr-pdf-rank" dir="ltr">
        {String(rank).padStart(2, "0")}
      </span>
      <div>
        <div className="ncr-pdf-action-head">
          <h3>{ncrExcerpt(priority.label, 116)}</h3>
          <span className="ncr-pdf-chip">{priority.visits > 1 ? "متكرر" : "أوديت واحد"}</span>
        </div>
        <div className="ncr-pdf-meta">
          {ncrPriorityCoverage(priority)}
          {priority.zero > 0 && <span className="ncr-pdf-red"> · {priority.zero} بدرجة صفر</span>}
          {priority.visits > 1 && (
            <span> · {priority.kind === "concept" ? "نفس المشكلة" : "نفس البند"}</span>
          )}
        </div>
        <p>
          <b>الإجراء المقترح:</b> {ncrExcerpt(priority.action, 165)}
        </p>
        {evidence && (
          <div className="ncr-pdf-evidence">
            <p>
              <b>{evidence.observation.trim() ? "من ملاحظات الأوديت:" : "البند المرجعي:"}</b>{" "}
              {ncrExcerpt(evidence.observation || evidence.question, 135)}
            </p>
            <small>
              {ncrExcerpt(evidence.section, 38)} ·{" "}
              <bdi>
                {audit?.date} / {audit?.program} /{" "}
                {evidence.itemId || evidence.questionId.slice(0, 8)}
              </bdi>{" "}
              · الدرجة{" "}
              <bdi>
                {evidence.earned}/{evidence.maximum}
              </bdi>
            </small>
          </div>
        )}
      </div>
    </section>
  );
}

function AuditTable({ audits }: { audits: NcrAudit[] }) {
  const recent = audits.slice(0, 6);
  return (
    <section className="ncr-pdf-audit">
      <SectionTitle
        title="الأوديتات المرجعية"
        subtitle={
          audits.length > recent.length
            ? `أحدث ${recent.length} من أصل ${audits.length}؛ القائمة الكاملة في التطبيق.`
            : "الأوديتات المعتمدة التي يغطيها التقرير."
        }
      />
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البرنامج</th>
            <th>رقم مرجعي</th>
            <th>الدرجة المسجلة</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((audit) => (
            <tr key={audit.id}>
              <td>
                <bdi>{audit.date}</bdi>
              </td>
              <td>
                <bdi>{audit.program}</bdi>
              </td>
              <td>
                <bdi>{audit.id.split("-").at(-1)}</bdi>
              </td>
              <td>
                <strong dir="ltr">{scoreLabel(audit.score)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MethodNote({
  unresolved,
  overall,
}: {
  unresolved: number;
  overall: NcrSummary["overall"];
}) {
  return (
    <span>
      تُحسب الحالة عند تسجيل درجة أقل من الحد الأقصى. التكرار يعني الظهور في أوديتين مختلفين على
      الأقل. المتوسط للنتائج المعتمدة المسجلة.
      {unresolved > 0 && ` البنود المستبعدة بسبب درجة غير صالحة أو غير محسومة: ${unresolved}.`}
      {overall.scored < overall.visits &&
        ` الأوديتات المستبعدة من المتوسط لعدم وجود درجة صالحة: ${overall.visits - overall.scored}.`}
    </span>
  );
}

function ReportFooter({
  page,
  total,
  branchName,
  children,
}: {
  page: number;
  total: number;
  branchName: string;
  children: ReactNode;
}) {
  return (
    <footer className="ncr-pdf-footer">
      <p>{children}</p>
      <div>
        <span>ضمان الجودة · {branchName}</span>
        <bdi>
          {page} / {total}
        </bdi>
      </div>
    </footer>
  );
}

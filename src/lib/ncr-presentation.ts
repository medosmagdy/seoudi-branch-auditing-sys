import {
  pickNcrEvidence,
  type NcrBranch,
  type NcrFilters,
  type summarizeNcr,
} from "./ncr-management";

export type NcrSummary = ReturnType<typeof summarizeNcr>;
export type NcrPriority = NcrSummary["priorities"][number];
export const ncrProgramLabel = { both: "FS + GHP", FS: "FS", GHP: "GHP" };
export const scoreLabel = (score: number | null) => (score === null ? "—" : `${score}%`);
export const ncrExcerpt = (value: string, limit: number) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const stop = clean.lastIndexOf(" ", limit);
  return `${clean.slice(0, stop >= limit * 0.75 ? stop : limit).trimEnd()}…`;
};

export function ncrPeriodLabel({ start, end }: Pick<NcrFilters, "start" | "end">) {
  const fmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${fmt.format(new Date(start + "T00:00:00Z"))} – ${fmt.format(new Date(end + "T00:00:00Z"))}`;
}

export function priorityEvidence(priority: NcrPriority) {
  return pickNcrEvidence(priority.findings);
}

export function ncrPriorityCoverage(priority: NcrPriority) {
  const audits =
    priority.visits === 1
      ? "أوديت واحد"
      : priority.visits === 2
        ? "أوديتين"
        : priority.visits <= 10
          ? `${priority.visits} أوديتات`
          : `${priority.visits} أوديتًا`;
  const cases = priority.findings.length;
  const caseLabel =
    cases === 1
      ? "حالة واحدة"
      : cases === 2
        ? "حالتان"
        : cases <= 10
          ? `${cases} حالات`
          : `${cases} حالة`;
  return `${caseLabel} في ${audits}`;
}

export const priorityLabel = (priority: NcrPriority) =>
  priority.isDelivery ? `الدليفري · ${priority.label}` : priority.label;

const actionLabel = "المطلوب من الفرع:";
const deliveryLabel = "الدليفري:";
export function ncrMailTemplate(branch: NcrBranch, filters: NcrFilters, summary: NcrSummary) {
  const name = ncrExcerpt(branch.name, 90) || "الفرع";
  const salutationBranch = /^فرع(?:\s|$)/.test(name) ? name : `فرع ${name}`;
  const period = ncrPeriodLabel(filters);
  const first = summary.priorities[0];
  const delivery = summary.priorities.find((item) => item.isDelivery);
  const floorActions = summary.priorities.filter((item) => !item.isDelivery).slice(0, 2);
  const leadActions = floorActions.length ? floorActions : first ? [first] : [];
  const actionText =
    leadActions.length > 1
      ? "\n" + leadActions.map((item, index) => `${index + 1}. ${item.action}`).join("\n")
      : ` ${leadActions[0]?.action ?? ""}`;
  const note = first
    ? `نقطة البداية المقترحة: «${ncrExcerpt(priorityLabel(first), 125)}». سُجّلت ${ncrPriorityCoverage(first)} خلال الفترة.`
    : summary.overall.visits
      ? "لم تظهر درجات أقل من الحد الأقصى في البنود ذات النتائج المسجلة ضمن الفترة. التقرير يوضح نطاق المراجعة والنتائج المتاحة."
      : "لا توجد أوديتات معتمدة ضمن الفترة المحددة في هذا التقرير.";
  const followUp = first
    ? `يرجى الرد بما تم تصحيحه، والمسؤول عن تنفيذه، والموعد المتوقع للتحقق. إذا تم التنفيذ بالفعل، يرجى إرفاق ما يوضحه.`
    : "شكرًا لفريق الفرع على المتابعة. برجاء الاستمرار في التحقق الدوري ومشاركتنا بأي نقاط تحتاج دعمًا.";
  return {
    subject: `متابعة نتائج الجودة | ${name} | ${ncrProgramLabel[filters.program]} | ${filters.start} إلى ${filters.end}`,
    body: [
      `الزملاء في فريق ${salutationBranch}،\nتحية طيبة،`,
      `مرفق ملخص مراجعات ${ncrProgramLabel[filters.program]} للفترة ${period}. التقرير يوضح الأولويات وأمثلة من الأوديتات لتسهيل المتابعة.`,
      note,
      ...(leadActions.length ? [`${actionLabel}${actionText}`] : []),
      ...(delivery && !first?.isDelivery
        ? [`${deliveryLabel} ${ncrExcerpt(delivery.label, 95)}. ${delivery.action}`]
        : []),
      followUp,
      "شكرًا لتعاونكم،\nفريق ضمان الجودة",
    ].join("\n\n"),
  };
}

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (mark) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[mark] ?? mark,
  );

export function ncrMailHtml(body: string) {
  // Inline styles and simple tables survive the Outlook desktop renderer. All edited text is escaped.
  const paragraphs = body
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const rows = paragraphs
    .map((paragraph) => {
      const text = escape(paragraph).replace(/\r?\n/g, "<br>");
      const bodyStyle =
        "direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.8";
      if (paragraph.startsWith(actionLabel) || paragraph.startsWith(deliveryLabel)) {
        return `<tr><td dir="rtl" bgcolor="#eaf5ee" style="${bodyStyle};color:#143c2e;border-right:4px solid #2f795b;padding:12px 16px">${text}</td></tr><tr><td height="12" style="font-size:1px">&nbsp;</td></tr>`;
      }
      return `<tr><td dir="rtl" style="${bodyStyle};color:#243b35;padding:0 2px 12px">${text}</td></tr>`;
    })
    .join("");
  return `<table dir="rtl" lang="ar" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;border:1px solid #d8e7dd;background-color:#ffffff"><tr><td bgcolor="#123b30" style="background-color:#123b30;color:#ffffff;text-align:right;font-family:Tahoma,Arial,sans-serif;font-size:17px;font-weight:bold;padding:14px 18px">متابعة نتائج الجودة</td></tr><tr><td style="padding:16px 18px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

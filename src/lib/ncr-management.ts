import { z } from "zod";

export const ncrProgram = z.enum(["FS", "GHP", "both"]);
export type NcrProgram = z.infer<typeof ncrProgram>;
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return !isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "تاريخ غير صالح");
export const ncrFiltersSchema = z
  .object({
    branchId: z.string().uuid(),
    start: dateOnly,
    end: dateOnly,
    program: ncrProgram,
  })
  .refine(
    ({ start, end }) => start <= end && (Date.parse(end) - Date.parse(start)) / 86_400_000 <= 3660,
    "اختار فترة صحيحة لا تتجاوز عشر سنوات",
  );
export type NcrFilters = z.infer<typeof ncrFiltersSchema>;
export type NcrPeriod = "month" | "quarter" | "year" | "custom";
export type NcrAudit = {
  id: string;
  date: string;
  program: Exclude<NcrProgram, "both">;
  score: number | null;
};
export type NcrFinding = {
  auditId: string;
  questionId: string;
  itemId: string;
  section: string;
  question: string;
  observation: string;
  earned: number;
  maximum: number;
};
export type NcrBranch = { id: string; name: string; active: boolean };

export function ncrPeriodBounds(period: Exclude<NcrPeriod, "custom">, anchor: string) {
  const [year, month] = anchor.split("-").map(Number) as [number, number];
  const first =
    period === "year" ? 1 : period === "quarter" ? 1 + Math.floor((month - 1) / 3) * 3 : month;
  const last = period === "year" ? 12 : period === "quarter" ? first + 2 : first;
  return {
    start: `${year}-${String(first).padStart(2, "0")}-01`,
    end: `${year}-${String(last).padStart(2, "0")}-${new Date(Date.UTC(year, last, 0)).getUTCDate()}`,
  };
}

export function normalizeNcrText(raw: string) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Only clear pairs of terms imply the same problem. Match one topic per finding;
// multiple matches keep their original checklist grouping rather than guessing.
const topics = [
  {
    id: "date-labels",
    label: "غياب أو عدم وضوح بيانات التاريخ",
    action: "راجع بطاقات التاريخ عند التحضير والاستلام وتحقق منها قبل العرض.",
    patterns: [
      /(تاريخ|تواريخ|تاريخه|تارخ|ديت|داتا|ليبل|ملصق|بطاقه).{0,36}(غير واضح|ناقص|مش واضح|ممسوح|مفقود|غايب|بدون|لا يوجد)/,
      /(عدم وجود|بدون|مفيش|لا يوجد|غير مدون|مش مكتوب).{0,30}(تاريخ|تواريخ|ديت|ليبل|ملصق|بطاقه)/,
      /(?:missing|illegible|unreadable).{0,25}(?:date label|date code|expiry date)/,
    ],
  },
  {
    id: "expired",
    label: "منتجات منتهية الصلاحية",
    action: "راجع تطبيق الأقدم انتهاءً أولاً واعزل المنتجات المنتهية عند اكتشافها.",
    patterns: [/منتهي.{0,9}الصلاحيه|انتهت.{0,9}الصلاحيه|منتهيه.{0,9}الصلاحيه|اكسباير|\bexpired\b/],
  },
  {
    id: "temperature",
    label: "حرارة الحفظ خارج الحدود",
    action: "تحقق من حرارة الحفظ الفعلية، وسلامة أجهزة القياس، والاستجابة عند تجاوز الحدود.",
    patterns: [
      /(حراره|درجه الحراره).{0,36}(مرتفع|عالي|غير مطابق|خارج|غير مناسب|مش مظبوط)/,
      /(ارتفاع|انخفاض|تجاوز).{0,30}(حراره|درجه الحراره)/,
      /(?:high|out of range|unsafe).{0,22}(?:temperature|cold holding)/,
    ],
  },
  {
    id: "cross-contamination",
    label: "خلط النيئ بالجاهز أو خطر تلوث تبادلي",
    action: "افصل النيئ عن الجاهز وراجع ترتيب التخزين وتخصيص الأدوات.",
    patterns: [
      /تلوث (تبادلي|خلطي|متبادل)|(?:نيئ|ناي).{0,25}(?:مع|فوق).{0,25}(?:مطهي|مستوي|جاهز)|cross contamination/,
    ],
  },
  {
    id: "hand-hygiene",
    label: "قصور في نظافة الأيدي",
    action: "تحقق من مستلزمات غسل الأيدي وراجع التطبيق مع العاملين في الوردية.",
    patterns: [
      /(عدم|لا يوجد|بدون|مفيش).{0,24}(غسل اليد|غسيل اليد|نظافه الايدي|صابون الايدي)/,
      /(?:poor|no|not).{0,20}hand ?washing/,
    ],
  },
  {
    id: "dirty-food-contact",
    label: "اتساخ أسطح أو أدوات ملامسة الغذاء",
    action: "راجع تنظيف وتطهير أدوات وأسطح ملامسة الغذاء وتحقق من التنفيذ بعد التنظيف.",
    patterns: [
      /(غير نظيف|متسخ|بقايا|اتساخ|غير مطهر).{0,30}(سطح|اسطح|لوح تقطيع|ادوات|سكاكين)/,
      /(سطح|اسطح|لوح تقطيع|ادوات|سكاكين).{0,24}(غير نظيف|متسخ|بقايا|اتساخ|غير مطهر)/,
      /(?:dirty|unclean).{0,20}(?:food contact|cutting board|utensils)/,
    ],
  },
  {
    id: "pest-evidence",
    label: "وجود آفات أو آثارها",
    action: "راجع برنامج مكافحة الآفات ونقاط الدخول وسجّل نتائج المتابعة.",
    patterns: [
      /(وجود|رصد|اثار|انتشار).{0,24}(حشرات|صراصير|فيران|قوارض|ذباب|افات)/,
      /(?:presence|evidence).{0,16}(?:pest|rodent|flies)|cockroach/,
    ],
  },
];

function explicitConcept(observation: string) {
  const normalized = normalizeNcrText(observation);
  const matches = topics.filter((x) => x.patterns.some((p) => p.test(normalized)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function summarizeNcr(audits: NcrAudit[], findings: NcrFinding[]) {
  const byAudit = new Map(audits.map((audit) => [audit.id, audit]));
  const seen = new Set<string>();
  const issues = findings.filter((finding) => {
    const key = `${finding.auditId}/${finding.questionId}`;
    if (
      !byAudit.has(finding.auditId) ||
      seen.has(key) ||
      !(finding.earned >= 0 && finding.maximum > finding.earned)
    )
      return false;
    seen.add(key);
    return true;
  });
  const groups = new Map<
    string,
    { label: string; action: string; kind: "concept" | "checklist"; findings: NcrFinding[] }
  >();
  const sections = new Map<string, { label: string; count: number; zero: number }>();
  // Exact question wording can group equivalent checklist entries across programs.
  // Unclassified or ambiguous comments never group across unrelated question text.
  for (const issue of issues) {
    const concept = explicitConcept(issue.observation);
    const section = normalizeNcrText(issue.section);
    const wording = normalizeNcrText(issue.question);
    const key = concept
      ? `concept/${concept.id}`
      : `checklist/${section}/${wording || issue.questionId}`;
    const bucket = groups.get(key) ?? {
      label: concept?.label ?? issue.question,
      kind: concept ? "concept" : "checklist",
      action:
        concept?.action ?? "راجع سبب عدم المطابقة مع مسؤول القسم وتحقق من تنفيذ الإجراء التصحيحي.",
      findings: [],
    };
    bucket.findings.push(issue);
    groups.set(key, bucket);
    const current = sections.get(section) ?? { label: issue.section, count: 0, zero: 0 };
    current.count++;
    if (issue.earned === 0) current.zero++;
    sections.set(section, current);
  }

  const priority = [...groups.entries()]
    .map(([id, group]) => ({
      id,
      ...group,
      visits: new Set(group.findings.map((finding) => finding.auditId)).size,
      zero: group.findings.filter((finding) => finding.earned === 0).length,
    }))
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        b.zero - a.zero ||
        b.findings.length - a.findings.length ||
        a.id.localeCompare(b.id),
    );
  const result = (program: "FS" | "GHP" | "both") => {
    const selected = audits.filter((audit) => program === "both" || audit.program === program);
    const scored = selected.flatMap((audit) =>
      audit.score !== null && audit.score >= 0 && audit.score <= 100 ? [audit.score] : [],
    );
    const ids = new Set(selected.map((audit) => audit.id));
    const matching = issues.filter((issue) => ids.has(issue.auditId));
    return {
      visits: selected.length,
      scored: scored.length,
      average: scored.length
        ? Math.round((scored.reduce((sum, score) => sum + score, 0) / scored.length) * 100) / 100
        : null,
      findings: matching.length,
      zero: matching.filter((issue) => issue.earned === 0).length,
    };
  };
  return {
    overall: result("both"),
    byProgram: { FS: result("FS"), GHP: result("GHP") },
    repeated: priority.filter((p) => p.visits > 1),
    priorities: priority.slice(0, 5),
    sections: [...sections.values()].sort((a, b) => b.count - a.count || b.zero - a.zero),
    findings: issues,
  };
}

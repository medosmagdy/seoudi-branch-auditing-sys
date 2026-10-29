import { slaughterChecklist } from "./slaughter-checklist";
export type SlaughterCase = {
  rejectionStage?: "live" | "carcass" | "unspecified";
  kind: "rejection" | "trimming" | "condemnation";
  item: string;
  quantity: number | null;
  unit: "piece" | "pair" | "animal" | "carcass" | "kg";
  affectedAnimals: number | null;
  weight: number | null;
  reason: string;
  category: "parasitic" | "viral" | "tb" | "managemental" | "other";
};
export type SlaughterInput = {
  number: number;
  received: number;
  farmWeight: number | null;
  receivingWeight: number | null;
  carcassWeight: number | null;
  fatWeight: number | null;
  rejectedWeight: number | null;
  condemnationWeight: number | null;
  acceptedException: number;
  farmLocation: string;
  slaughterhouseLocation: string;
  breed: string;
  hijriDate: string;
  season: "Normal" | "Ramadan" | "Adha Season";
  tripDuration: string;
  trucks: { number: string; temperature: number | null }[];
  cases: SlaughterCase[];
  importantNotes: { rejection: string; trimming: string; condemnation: string };
  nonconformities: Record<string, string>;
  directDegrees: Record<string, string>;
  modes: Record<string, "count" | "direct">;
  notes: Record<string, string>;
  observations?: {
    cuttingLegLigaments: string;
    heterogeneousSelection: string;
    badStamping: string;
    bruises: string;
    overCapacityRoughHandling: string;
  };
  weightSource: "measured" | "estimated";
  weightSourceNote: string;
};
const directItems = new Set([
  "General health condition",
  "Lymph nodes",
  "Facilities",
  "Tools",
  "Employee",
  "Cleaning and sanitation",
]);
export const ratio = (numerator: number | null, denominator: number) =>
  numerator === null || !Number.isFinite(numerator) || denominator <= 0
    ? null
    : numerator / denominator;
export const finiteNumber = (value: string) => (value.trim() === "" ? null : Number(value));
export function defaultSlaughterMode(item: string): "count" | "direct" {
  return directItems.has(item) ? "direct" : "count";
}
export function pieces(quantity: number | null, unit: SlaughterCase["unit"]) {
  return quantity === null
    ? null
    : unit === "pair"
      ? quantity * 2
      : unit === "piece"
        ? quantity
        : null;
}
export function hijriForDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parts = new Intl.DateTimeFormat("en-GB-u-ca-islamic-umalqura", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(date + "T12:00:00Z"));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}
export function seasonForHijri(date: string): SlaughterInput["season"] {
  const [day, month] = date.split("/").map(Number);
  return month === 9
    ? "Ramadan"
    : month === 12 && (day ?? 0) >= 1 && (day ?? 0) <= 9
      ? "Adha Season"
      : "Normal";
}
export function emptySlaughterInput(): SlaughterInput {
  return {
    number: 0,
    received: 0,
    farmWeight: null,
    receivingWeight: null,
    carcassWeight: null,
    fatWeight: null,
    rejectedWeight: null,
    condemnationWeight: null,
    acceptedException: 0,
    farmLocation: "",
    slaughterhouseLocation: "",
    breed: "",
    hijriDate: "",
    season: "Normal",
    tripDuration: "",
    trucks: [],
    cases: [],
    importantNotes: { rejection: "", trimming: "", condemnation: "" },
    nonconformities: {},
    directDegrees: {},
    modes: {},
    notes: {},
    weightSource: "measured",
    weightSourceNote: "",
  };
}
export function evaluateSlaughter(input: SlaughterInput) {
  const checklist = slaughterChecklist.flatMap((section, sectionIndex) =>
    section.rows.map((row) => {
      const mode = input.modes[row.label] ?? defaultSlaughterMode(row.label);
      const raw = input.nonconformities[row.label] ?? "";
      const count = raw.trim() === "" ? 0 : Number(raw);
      const direct = finiteNumber(input.directDegrees[row.label] ?? "");
      const degree =
        mode === "direct"
          ? direct !== null && Number.isFinite(direct) && direct >= 0 && direct <= row.total
            ? direct
            : null
          : input.received > 0 && Number.isInteger(count) && count >= 0 && count <= input.received
            ? ((input.received - count) / input.received) * row.total
            : null;
      return {
        section: section.title,
        sectionIndex,
        item: row.label,
        maximum: row.total,
        mode,
        nonconformity: mode === "count" ? count : null,
        degree,
        note: input.notes[row.label] ?? "",
      };
    }),
  );
  const sectionScores = slaughterChecklist.map((section, index) => {
    const rows = checklist.filter((row) => row.sectionIndex === index);
    return {
      title: section.title,
      maximum: rows.reduce((sum, row) => sum + row.maximum, 0),
      degree: rows.some((row) => row.degree === null)
        ? null
        : rows.reduce((sum, row) => sum + row.degree!, 0),
    };
  });
  const at = (index: number) => sectionScores[index]?.degree ?? null;
  const score =
    input.received <= 0 || sectionScores.some((s) => s.degree === null)
      ? null
      : sectionScores.reduce((sum, s) => sum + s.degree!, 0);
  const loss =
    input.farmWeight === null || input.receivingWeight === null
      ? null
      : input.farmWeight - input.receivingWeight;
  return {
    checklist,
    sectionScores,
    score,
    missing: checklist.filter((r) => r.degree === null).map((r) => r.item),
    metrics: {
      am: at(0),
      hygiene: at(1),
      pm: at(2),
      meatQuality: at(3),
      transportation: at(4),
      examination: at(0) === null || at(2) === null ? null : (at(0)! / 25 + at(2)! / 50) / 2,
      rejected: input.number - input.received,
      exceptionRate: ratio(input.acceptedException, input.received),
      transportationLoss: loss,
      transportationLossRate: ratio(loss, input.farmWeight ?? 0),
      averageFarmWeight: ratio(input.farmWeight, input.number),
      averageReceivingWeight: ratio(input.receivingWeight, input.number),
      averageRejectedWeight: ratio(input.rejectedWeight, input.number - input.received),
      averageCarcassWeight: ratio(input.carcassWeight, input.received),
      averageFatWeight: ratio(input.fatWeight, input.received),
      averageTransportationLoss: ratio(loss, input.number),
      dressing: ratio(input.carcassWeight, input.farmWeight ?? 0),
    },
  };
}
export function validateSlaughterInput(input: SlaughterInput): string | null {
  if (
    input.hijriDate &&
    (!/^\d{2}\/\d{2}\/\d{4}$/.test(input.hijriDate) ||
      Number(input.hijriDate.slice(0, 2)) < 1 ||
      Number(input.hijriDate.slice(0, 2)) > 30 ||
      Number(input.hijriDate.slice(3, 5)) < 1 ||
      Number(input.hijriDate.slice(3, 5)) > 12)
  )
    return "راجع التاريخ الهجري بصيغة يوم/شهر/سنة";
  if (
    !Number.isInteger(input.number) ||
    input.number <= 0 ||
    !Number.isInteger(input.received) ||
    input.received < 0 ||
    input.received > input.number
  )
    return "راجع العدد الكلي والمستلم";
  if (
    !Number.isInteger(input.acceptedException) ||
    input.acceptedException < 0 ||
    input.acceptedException > input.received
  )
    return "القبول الاستثنائي جزء من المستلم؛ يجب أن يكون بين صفر وعدد المستلم";
  for (const weight of [
    input.farmWeight,
    input.receivingWeight,
    input.carcassWeight,
    input.fatWeight,
    input.rejectedWeight,
    input.condemnationWeight,
  ])
    if (weight !== null && (!Number.isFinite(weight) || weight < 0))
      return "الأوزان يجب أن تكون أرقامًا موجبة أو صفر";
  for (const section of slaughterChecklist)
    for (const row of section.rows) {
      const mode = input.modes[row.label] ?? defaultSlaughterMode(row.label);
      const raw =
        mode === "direct" ? input.directDegrees[row.label] : input.nonconformities[row.label];
      if (raw?.trim()) {
        const value = Number(raw);
        if (
          !Number.isFinite(value) ||
          value < 0 ||
          (mode === "direct"
            ? value > row.total
            : !Number.isInteger(value) || value > input.received)
        )
          return `راجع قيمة البند: ${row.label}`;
      }
    }
  for (const truck of input.trucks)
    if (!truck.number.trim() || truck.temperature === null || !Number.isFinite(truck.temperature))
      return "كل سيارة تحتاج رقمًا ودرجة حرارة مغادرة صالحة";
  for (const item of input.cases) {
    if (!item.item.trim()) return "أدخل اسم العضو أو الحالة لكل سطر";
    if (
      item.quantity !== null &&
      (!Number.isFinite(item.quantity) ||
        item.quantity < 0 ||
        (item.unit !== "kg" && !Number.isInteger(item.quantity)))
    )
      return "راجع كمية الحالة ووحدتها";
    if (
      item.affectedAnimals !== null &&
      (!Number.isInteger(item.affectedAnimals) ||
        item.affectedAnimals < 0 ||
        item.affectedAnimals > input.number)
    )
      return "راجع عدد الحيوانات المتأثرة بالحالة";
    if (item.weight !== null && (!Number.isFinite(item.weight) || item.weight < 0))
      return "راجع وزن الحالة";
  }
  if (input.weightSource === "estimated" && !input.weightSourceNote.trim())
    return "اذكر مصدر أو طريقة تقدير الأوزان";
  return null;
}
export function slaughterWarnings(input: SlaughterInput): string[] {
  const warnings: string[] = [];
  if ((evaluateSlaughter(input).metrics.transportationLoss ?? 0) < 0)
    warnings.push(
      "وزن الاستلام أكبر من وزن المزرعة؛ الفقد ظاهر بالسالب ولم يُحوّل لصفر. راجع الوزنين.",
    );
  if (input.received === 0)
    warnings.push("لا يوجد مستلم؛ التقييم والنسب التي تعتمد عليه غير متاحة.");
  const rejectionCases = input.cases.filter((item) => item.kind === "rejection");
  const count = rejectionCases.reduce((sum, item) => sum + (item.affectedAnimals ?? 0), 0);
  if (rejectionCases.length && count !== input.number - input.received)
    warnings.push(
      "عدد الحيوانات في تفاصيل الرفض لا يطابق إجمالي المرفوض؛ قد تكون هناك حالات ناقصة أو متداخلة.",
    );
  if (input.cases.some((item) => item.unit === "pair" || item.unit === "piece"))
    warnings.push(
      "كمية الأعضاء منفصلة عن عدد الحيوانات المتأثرة؛ لا تُجمع كليهما ولا تُحوّل القطع إلى حالات تلقائيًا.",
    );
  return warnings;
}
export type SlaughterEvaluation = ReturnType<typeof evaluateSlaughter>;

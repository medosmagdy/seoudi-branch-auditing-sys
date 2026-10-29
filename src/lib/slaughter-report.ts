import {
  validateSlaughterInput,
  type SlaughterInput,
  type SlaughterEvaluation,
} from "./slaughter-evaluation";
export interface SlaughterDetailsV1 {
  version: 1;
  score: number;
  farmWeight: number;
  receivingWeight: number;
  fatWeight: number;
  tripDuration: string;
  acceptedException: number;
  notes: Record<string, string>;
  nonconformities: Record<string, string>;
  checklist: {
    section: string;
    item: string;
    maximum: number;
    nonconformity: number;
    degree: number;
    note: string;
  }[];
}
export interface SlaughterDetailsV2 {
  version: 2;
  score: number | null;
  input: SlaughterInput;
  evaluation: SlaughterEvaluation;
}
export type SlaughterDetails = SlaughterDetailsV1 | SlaughterDetailsV2;

export interface SlaughterDraft {
  id?: string;
  date: string;
  farm: string;
  slaughterhouse: string;
  animalType: string;
  number: number;
  received: number;
  carcassWeight: number;
  meatScore: number | null;
  rejectionReason: string;
  acceptedException: number;
  photos: File[];
  details: SlaughterDetails;
}
export function validateSlaughterDraft(draft: SlaughterDraft): string | null {
  if (!draft.date || !draft.farm.trim() || !draft.slaughterhouse.trim() || !draft.animalType)
    return "أكمل التاريخ والمزرعة والمجزر ونوع الحيوان";
  if (draft.details.version === 2) return validateSlaughterInput(draft.details.input);
  if (
    !Number.isInteger(draft.number) ||
    draft.number <= 0 ||
    !Number.isInteger(draft.received) ||
    draft.received < 0 ||
    draft.received > draft.number
  )
    return "راجع العدد الكلي والمستلم؛ الأعداد أعداد صحيحة والمستلم بين صفر والعدد الكلي";
  if (
    !Number.isInteger(draft.acceptedException) ||
    draft.acceptedException < 0 ||
    draft.acceptedException > draft.received
  )
    return "القبول الاستثنائي يجب أن يكون بين صفر وعدد المستلم";
  if (
    [
      draft.carcassWeight,
      draft.details.farmWeight,
      draft.details.receivingWeight,
      draft.details.fatWeight,
    ].some((v) => !Number.isFinite(v) || v < 0)
  )
    return "الأوزان يجب أن تكون أرقامًا موجبة أو صفر";
  if (
    !Number.isFinite(draft.meatScore) ||
    draft.meatScore === null ||
    draft.meatScore < 0 ||
    draft.meatScore > 100
  )
    return "راجع تقييم التقرير";
  if (
    Object.values(draft.details.nonconformities).some(
      (value) =>
        value !== "" &&
        (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > draft.received),
    )
  )
    return "عدد حالات عدم المطابقة لكل بند يجب أن يكون بين صفر وعدد المستلم";
  return null;
}
// Historical archive uses fractions; newly saved reports use percentages.
export function slaughterPercent(
  value: number | null | undefined,
  unit: "legacy" | "percentage" = "legacy",
): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${(unit === "legacy" && number >= 0 && number <= 1 ? number * 100 : number).toFixed(1)}%`;
}
export function rejectionSummary(
  reports: { rejectionReasons?: string; rejected: number }[],
  reasons: string[],
) {
  return Object.fromEntries(
    reasons.map((reason) => [
      reason,
      reports.filter((report) =>
        (report.rejectionReasons ?? "").toLowerCase().includes(reason.toLowerCase()),
      ).length,
    ]),
  );
}

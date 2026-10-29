import type { SlaughterDetails } from "./slaughter-report";
import { slaughterChecklist } from "./slaughter-checklist";
import { ratio } from "./slaughter-evaluation";
export interface SlaughterReport {
  id: string | number;
  date: string;
  farm: string;
  slaughterhouse: string;
  animalType: string;
  number: number;
  received: number;
  rejected: number;
  carcassWeight: number | null;
  meatScore: number | null;
  status: string;
  details?: SlaughterDetails | undefined;
  hijriDate?: string;
  season?: string;
  breed?: string;
  rejectionReasons?: string;
  totalWeight?: number;
  receivingWeight?: number;
  transportationLoss?: number;
  kidneysFat?: number;
  averageTotalWeight?: number;
  averageReceivingWeight?: number;
  averageTransportationLoss?: number;
  averageCarcassWeight?: number;
  averageKidneysFat?: number;
  am?: number;
  slaughterhouseHygiene?: number;
  pm?: number;
  meatTransportation?: number;
  weightLoss?: number;
  examination?: number;
  dressing?: number;
  slaughteringEvaluation?: number | null;
  condemnation?: string;
  cuttingLegLigaments?: string;
  trimming?: string;
  heterogeneousSelection?: string;
  badStamping?: string;
  bruises?: number;
  acceptedAsException?: number;
  overCapacityRoughHandling?: number;
  totalRejectedWeight?: number;
}
export function slaughterView(report: SlaughterReport) {
  const d = report.details;
  if (d?.version === 2) {
    const i = d.input,
      m = d.evaluation.metrics;
    return {
      score: d.score,
      meatQuality: m.meatQuality,
      am: m.am,
      hygiene: m.hygiene,
      pm: m.pm,
      transportation: m.transportation,
      examination: m.examination,
      farmWeight: i.farmWeight,
      receivingWeight: i.receivingWeight,
      fatWeight: i.fatWeight,
      carcassWeight: i.carcassWeight,
      averageFarmWeight: m.averageFarmWeight,
      averageReceivingWeight: m.averageReceivingWeight,
      averageCarcassWeight: m.averageCarcassWeight,
      averageFatWeight: m.averageFatWeight,
      averageTransportationLoss: m.averageTransportationLoss,
      transportationLoss: m.transportationLoss,
      transportationLossRate: m.transportationLossRate,
      dressing: m.dressing,
      acceptedException: i.acceptedException,
      exceptionRate: m.exceptionRate,
      hijriDate: i.hijriDate,
      season: i.season,
      breed: i.breed,
      condemnation: i.importantNotes.condemnation,
      rejectedWeight: i.rejectedWeight,
    };
  }
  const group = (index: number) => {
    if (d?.version !== 1) return null;
    const title = slaughterChecklist[index]?.title;
    const rows = d.checklist.filter((r) => r.section === title);
    return rows.length ? rows.reduce((sum, row) => sum + row.degree, 0) : null;
  };
  const legacyScore = report.slaughteringEvaluation ?? (d?.version === 1 ? d.score : null);
  return {
    score:
      d?.version === 1
        ? d.score
        : legacyScore === null
          ? null
          : legacyScore <= 1
            ? legacyScore * 100
            : legacyScore,
    meatQuality: d?.version === 1 ? group(3) : report.meatScore,
    am: group(0) ?? report.am ?? null,
    hygiene: group(1) ?? report.slaughterhouseHygiene ?? null,
    pm: group(2) ?? report.pm ?? null,
    transportation: group(4) ?? report.meatTransportation ?? null,
    examination: report.examination ?? null,
    farmWeight: d?.version === 1 ? d.farmWeight : (report.totalWeight ?? null),
    receivingWeight: d?.version === 1 ? d.receivingWeight : (report.receivingWeight ?? null),
    fatWeight: d?.version === 1 ? d.fatWeight : (report.kidneysFat ?? null),
    carcassWeight: report.carcassWeight,
    averageFarmWeight: report.averageTotalWeight ?? null,
    averageReceivingWeight: report.averageReceivingWeight ?? null,
    averageCarcassWeight: report.averageCarcassWeight ?? null,
    averageFatWeight: report.averageKidneysFat ?? null,
    averageTransportationLoss: report.averageTransportationLoss ?? null,
    transportationLoss: report.transportationLoss ?? null,
    transportationLossRate: report.weightLoss ?? null,
    dressing: report.dressing ?? null,
    acceptedException:
      d?.version === 1 ? d.acceptedException : (report.acceptedAsException ?? null),
    exceptionRate: null,
    hijriDate: report.hijriDate ?? "",
    season: report.season ?? "",
    breed: report.breed ?? "",
    condemnation: report.condemnation ?? "",
    rejectedWeight: report.totalRejectedWeight ?? null,
  };
}
export function reportFromSlaughterRow(row: any): SlaughterReport {
  const details = row.report_details as SlaughterDetails | undefined;
  const base: SlaughterReport = {
    id: row.id,
    date: row.report_date,
    farm: row.farm_name,
    slaughterhouse: row.slaughterhouse_name,
    animalType: row.animal_type,
    number: Number(row.total_count),
    received: Number(row.received_count ?? 0),
    rejected: Number(
      row.rejected_count ?? Number(row.total_count) - Number(row.received_count ?? 0),
    ),
    carcassWeight: row.carcass_weight == null ? null : Number(row.carcass_weight),
    meatScore: null,
    slaughteringEvaluation: details
      ? details.score
      : row.meat_score == null
        ? null
        : Number(row.meat_score),
    rejectionReasons: row.rejection_reason ?? "",
    details,
    status: row.status === "draft" ? "مسودة" : row.status === "approved" ? "معتمد" : "مكتمل",
  };
  const view = slaughterView(base);
  return { ...base, carcassWeight: view.carcassWeight, meatScore: view.meatQuality };
}
export function aggregateSlaughter(
  reports: SlaughterReport[],
  by: "farm" | "animalType" | "year" | "month" | "season",
) {
  const groups = new Map<string, SlaughterReport[]>();
  for (const report of reports) {
    const view = slaughterView(report);
    const key =
      by === "year"
        ? report.date.slice(0, 4)
        : by === "month"
          ? report.date.slice(0, 7)
          : by === "season"
            ? view.season || "غير مسجل"
            : report[by];
    const grouped =
      by === "farm" ? slaughterNameKey(key) : by === "animalType" ? slaughterAnimalType(key) : key;
    groups.set(grouped, [...(groups.get(grouped) ?? []), report]);
  }
  return [...groups]
    .map(([key, rows]) => {
      const count = rows.reduce((s, r) => s + r.number, 0),
        received = rows.reduce((s, r) => s + r.received, 0),
        rejected = rows.reduce((s, r) => s + r.rejected, 0);
      const scores = rows.map((r) => slaughterView(r).score).filter((n): n is number => n !== null);
      const weights = rows.map((r) => slaughterView(r));
      const weightSum = (field: "carcassWeight" | "farmWeight" | "transportationLoss") =>
        weights.every((r) => r[field] !== null) ? weights.reduce((s, r) => s + r[field]!, 0) : null;
      return {
        key: by === "farm" ? rows[0]!.farm : key,
        reports: rows.length,
        number: count,
        received,
        rejected,
        rejectionRate: ratio(rejected, count),
        score: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null,
        scoredReports: scores.length,
        carcassWeight: weightSum("carcassWeight"),
        farmWeight: weightSum("farmWeight"),
        transportationLoss: weightSum("transportationLoss"),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, "ar"));
}

export function aggregateRejectionCases(reports: SlaughterReport[]) {
  const groups = new Map<
    string,
    {
      farm: string;
      category: string;
      stage: string;
      reports: Set<string>;
      cases: number;
      affectedAnimals: number | null;
    }
  >();
  for (const report of reports)
    if (report.details?.version === 2)
      for (const item of report.details.input.cases.filter((c) => c.kind === "rejection")) {
        const key = JSON.stringify([
          slaughterNameKey(report.farm),
          item.category,
          item.rejectionStage ?? "unspecified",
        ]);
        const row = groups.get(key) ?? {
          farm: report.farm,
          category: item.category,
          stage: item.rejectionStage ?? "unspecified",
          reports: new Set<string>(),
          cases: 0,
          affectedAnimals: 0,
        };
        row.reports.add(String(report.id));
        row.cases++;
        row.affectedAnimals =
          row.affectedAnimals === null || item.affectedAnimals === null
            ? null
            : row.affectedAnimals + item.affectedAnimals;
        groups.set(key, row);
      }
  return [...groups.values()].map((row) => ({
    farm: row.farm,
    category: row.category,
    stage: row.stage,
    reports: row.reports.size,
    cases: row.cases,
    affectedAnimals: row.affectedAnimals,
  }));
}

export const slaughterNameKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export function slaughterAnimalType(name: string) {
  const key = slaughterNameKey(name);
  return (
    (
      {
        bulls: "Bulls",
        sheep: "Sheep",
        goat: "Goats",
        goats: "Goats",
        baffalo: "Buffalo",
        buffalo: "Buffalo",
      } as Record<string, string>
    )[key] ?? name.trim()
  );
}

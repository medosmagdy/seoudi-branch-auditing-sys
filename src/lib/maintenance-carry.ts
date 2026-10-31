import {
  duplicateFindings,
  latestReports,
  type MaintenanceReport,
  type ReportSummary,
} from "./maintenance";
export interface CarryDependencies {
  index: () => Promise<{ reports: ReportSummary[] }>;
  load: (id: string) => Promise<MaintenanceReport>;
  create: (
    branch: string,
    date: string,
    reviewer: string,
    source: string | null,
  ) => Promise<string>;
  save: (report: MaintenanceReport) => Promise<number>;
  remove: (id: string, version: number) => Promise<void>;
}
// Take a fresh snapshot before creating anything, then persist the selected notes as an independent draft.
export async function carryLatestUnfinished(
  branch: string,
  date: string,
  reviewer: string,
  deps: CarryDependencies,
  statuses: MaintenanceReport['findings'][number]['status'][] = ['open'],
  sourceId: string | null = null,
) {
  if (!statuses.length) throw new Error("اختر حالة واحدة على الأقل.");
  const latest = sourceId ? null : latestReports((await deps.index()).reports).find((r) => r.branch_id === branch);
  if (!sourceId && !latest) throw new Error("لا يوجد تقرير معتمد سابق لهذا الفرع.");
  const source = await deps.load(sourceId ?? latest!.id);
  if (source.branch_id !== branch || (!sourceId && source.status !== "submitted"))
    throw new Error("تغير التقرير السابق؛ أعد المحاولة.");
  const open = source.findings.filter((f) => statuses.includes(f.status));
  if (!open.length)
    throw new Error(
      "التقرير المصدر لا يحتوي على ملاحظات بالحالات المختارة. يمكنك إنشاء تقرير فارغ.",
    );
  const id = await deps.create(branch, date, reviewer, null);
  try {
    const draft = await deps.load(id);
    if (draft.branch_id !== branch || draft.status !== "draft")
      throw new Error("تعذر التحقق من المسودة الجديدة.");
    await deps.save({
      ...draft,
      ...(draft.branch_manager !== undefined
        ? { branch_manager: source.branch_manager ?? "" }
        : {}),
      ...(draft.maintenance_area_manager !== undefined
        ? { maintenance_area_manager: source.maintenance_area_manager ?? "" }
        : {}),
      findings: duplicateFindings(open),
    });
    return id;
  } catch (error) {
    try {
      await deps.remove(id, 1);
    } catch {
      throw new Error(
        "لم يتأكد حفظ النقل أو حذف المسودة الجديدة؛ راجع قائمة تقارير الفرع قبل إعادة المحاولة.",
      );
    }
    throw error;
  }
}

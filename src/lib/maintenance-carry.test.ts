import { describe, it, expect, vi } from "vitest";
import {
  blankFinding,
  filterReportFindings,
  type MaintenanceReport,
  type ReportSummary,
} from "./maintenance";
import { carryLatestUnfinished, type CarryDependencies } from "./maintenance-carry";
import { maintenanceWorkbook } from "./maintenance-export";
import { read, utils, write } from "xlsx";
function fixture() {
  const branch = crypto.randomUUID(),
    other = crypto.randomUUID(),
    old = crypto.randomUUID(),
    newer = crypto.randomUUID(),
    draftId = crypto.randomUUID(),
    newId = crypto.randomUUID();
  const photo = `maintenance/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
  const findings = [
    {
      ...blankFinding(),
      section: "سمك",
      description: "لم يتم",
      status: "open" as const,
      photos: [photo],
      comments: "تعليق",
      initial_history: "9/2024",
    },
    { ...blankFinding(), section: "جزارة", description: "تم", status: "resolved" as const },
    { ...blankFinding(), section: "مخزن", description: "جديد", status: "new" as const },
    { ...blankFinding(), section: "خباز", description: "جارٍ", status: "in_progress" as const },
  ];
  const report = (
    id: string,
    status: "draft" | "submitted",
    date: string,
    items = findings,
  ): MaintenanceReport => ({
    id,
    branch_id: branch,
    inspection_date: date,
    reviewer: "مراجع",
    status,
    version: 1,
    created_at: date + "T00:00:00Z",
    source_report_id: null,
    findings: items,
  });
  const source = {
      ...report(newer, "submitted", "2026-09-01"),
      branch_manager: "مدير الفرع",
      maintenance_area_manager: "مدير المنطقة",
    },
    target = {
      ...report(newId, "draft", "2027-01-01", []),
      branch_manager: "",
      maintenance_area_manager: "",
    };
  const summary = (
    id: string,
    status: "draft" | "submitted",
    date: string,
    b = branch,
  ): ReportSummary => ({
    id,
    branch_id: b,
    inspection_date: date,
    reviewer: "مراجع",
    status,
    version: 1,
    created_at: date + "T00:00:00Z",
    total: 4,
    resolved: 1,
    high_open: 0,
  });
  const deps: CarryDependencies = {
    index: vi.fn().mockResolvedValue({
      reports: [
        summary(old, "submitted", "2026-06-01"),
        summary(newer, "submitted", "2026-09-01"),
        summary(draftId, "draft", "2026-12-01"),
        summary(crypto.randomUUID(), "submitted", "2026-12-30", other),
      ],
    }),
    load: vi.fn(async (id) => (id === newId ? target : source)),
    create: vi.fn().mockResolvedValue(newId),
    save: vi.fn().mockResolvedValue(2),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { branch, newId, newer, source, target, deps, findings };
}
describe("carry unfinished notes safely", () => {
  it("uses the latest submitted report for the same branch and copies only لم يتم with photos, retaining the source", async () => {
    const { branch, newId, newer, source, deps, findings } = fixture();
    const before = JSON.stringify(source);
    expect(await carryLatestUnfinished(branch, "2027-01-01", "مراجع", deps)).toBe(newId);
    expect(deps.load).toHaveBeenNthCalledWith(1, newer);
    expect(deps.create).toHaveBeenCalledWith(branch, "2027-01-01", "مراجع", null);
    const saved = vi.mocked(deps.save).mock.calls[0]![0];
    expect(saved.branch_manager).toBe("مدير الفرع");
    expect(saved.maintenance_area_manager).toBe("مدير المنطقة");
    expect(saved.findings).toHaveLength(1);
    expect(saved.findings[0]).toMatchObject({
      status: "open",
      description: "لم يتم",
      photos: findings[0]!.photos,
      comments: "تعليق",
      initial_history: "9/2024",
    });
    expect(saved.findings[0]!.id).not.toBe(findings[0]!.id);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("creates nothing if latest submitted report has no لم يتم", async () => {
    const { branch, source, deps } = fixture();
    source.findings = source.findings.filter((f) => f.status !== "open");
    await expect(carryLatestUnfinished(branch, "2027-01-01", "مراجع", deps)).rejects.toThrow(
      "لا يحتوي",
    );
    expect(deps.create).not.toHaveBeenCalled();
  });
  it("removes a newly created untouched draft when saving fails and reports uncertainty if cleanup fails", async () => {
    const { branch, newId, deps } = fixture();
    vi.mocked(deps.save).mockRejectedValue(new Error("save failed"));
    await expect(carryLatestUnfinished(branch, "2027-01-01", "مراجع", deps)).rejects.toThrow(
      "save failed",
    );
    expect(deps.remove).toHaveBeenCalledWith(newId, 1);
    vi.mocked(deps.remove).mockRejectedValue(new Error("network"));
    await expect(carryLatestUnfinished(branch, "2027-01-01", "مراجع", deps)).rejects.toThrow(
      "راجع قائمة تقارير الفرع",
    );
  });
});
it("exports exactly the selected status and keeps the all-states export intact", () => {
  const { findings } = fixture();
  for (const filter of ["all", "open", "resolved", "new", "in_progress"] as const) {
    const visible = filterReportFindings(findings, filter),
      book = maintenanceWorkbook(
        visible.map((x) => x.finding),
        "Report",
      ),
      xlsx = read(write(book, { type: "array", bookType: "xlsx" }), { type: "array" }),
      rows = utils.sheet_to_json<unknown[]>(xlsx.Sheets["Maintenance"]!, { header: 1 }),
      descriptions = rows.slice(4).map((r) => r[4]);
    expect(descriptions).toEqual(visible.map((x) => x.finding.description));
    expect(visible.length).toBe(filter === "all" ? 4 : 1);
  }
  expect(filterReportFindings(findings, "resolved")[0]!.index).toBe(1);
});

it("filters section and status together for the Excel data", () => {
  const { findings } = fixture();
  expect(filterReportFindings(findings, "open", "سمك")).toHaveLength(1);
  expect(filterReportFindings(findings, "open", "جزارة")).toHaveLength(0);
  expect(filterReportFindings(findings, "all", "جزارة").map((x) => x.finding.description)).toEqual([
    "تم",
  ]);
});

import { describe, it, expect } from "vitest";
import {
  blankFinding,
  metrics,
  latestReports,
  duplicateFindings,
  filterLog,
  reportFileName,
  findingSchema,
} from "./maintenance";
import { maintenanceWorkbook } from "./maintenance-export";
import { utils, read, write } from "xlsx";
describe("maintenance current branch snapshot", () => {
  it("selects latest submitted inspection per branch before any filtering, retaining an empty latest report", () => {
    const rows = [
      {
        id: "a",
        branch_id: "1",
        status: "submitted" as const,
        inspection_date: "2026-06-01",
        created_at: "2026-10-30",
      },
      {
        id: "b",
        branch_id: "1",
        status: "submitted" as const,
        inspection_date: "2026-09-01",
        created_at: "2026-09-01",
      },
      {
        id: "c",
        branch_id: "1",
        status: "draft" as const,
        inspection_date: "2026-12-01",
        created_at: "2026-12-01",
      },
      {
        id: "d",
        branch_id: "2",
        status: "submitted" as const,
        inspection_date: "2026-07-01",
        created_at: "2026-07-01",
      },
    ];
    expect(latestReports(rows).map((r) => r.id)).toEqual(["b", "d"]);
    expect(rows[0]!.id).toBe("a");
    expect(
      latestReports([...rows, { ...rows[1]!, id: "z", created_at: "2026-10-01" }]).map((r) => r.id),
    ).toEqual(["z", "d"]);
  });
  it("counts high risk only while unresolved and excludes resolved from overdue without inventing deadlines", () => {
    const a = {
        ...blankFinding(),
        section: "أسماك",
        description: "عطل",
        status: "resolved" as const,
        severity: "high" as const,
        due_date: "2026-01-01",
      },
      b = { ...a, id: crypto.randomUUID(), status: "open" as const },
      c = { ...b, id: crypto.randomUUID(), severity: "low" as const, due_date: null };
    expect(metrics([a, b, c], "2026-10-30")).toEqual({
      total: 3,
      resolved: 1,
      open: 2,
      high: 1,
      overdue: 1,
      rate: expect.closeTo(100 / 3, 8),
    });
    expect(metrics([]).rate).toBeNull();
  });
  it("duplicates independent note identifiers and arrays while preserving dates, status and evidence", () => {
    const a = {
      ...blankFinding(),
      section: "جزارة",
      description: "صدأ",
      status: "resolved" as const,
      photos: [
        "maintenance/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg",
      ],
    };
    const copy = duplicateFindings([a])[0]!;
    expect(copy.id).not.toBe(a.id);
    expect(copy.status).toBe("resolved");
    copy.photos.pop();
    expect(a.photos).toHaveLength(1);
  });
  it("applies branch, severity and status together and retains authentic fields in the exported workbook", () => {
    const f = {
      ...blankFinding(),
      section: "الأسماك",
      description: "عطل باب",
      branch_name: "شيراتون",
      branch_id: "b",
      report_id: "r",
      inspection_date: "2026-09-01",
      severity: "high" as const,
      status: "open" as const,
      initial_history: "9/2024",
      evidence: "طلب شراء",
      comments: "تعليق",
    };
    expect(filterLog([f], "b", "high", "open", "باب")).toHaveLength(1);
    expect(filterLog([f], "b", "low", "open")).toHaveLength(0);
    const book = maintenanceWorkbook([f], "Maintenance");
    const decoded = read(write(book, { type: "array", bookType: "xlsx" }), { type: "array" });
    const data = utils.sheet_to_json<unknown[]>(decoded.Sheets["Maintenance"]!, { header: 1 });
    expect(data[4]!.slice(3, 11)).toEqual([
      "الأسماك",
      "عطل باب",
      "9/2024",
      "عالية",
      "",
      "طلب شراء",
      "لم يتم",
      "تعليق",
    ]);
  });
  it("validates real dates and names quarterly reports from inspection date", () => {
    expect(reportFileName("Sheraton", "2026-09-01")).toBe("Sheraton Maintenance Report Q3-2026");
    expect(reportFileName("Sheraton", "2026-10-01")).toContain("Q4-2026");
    expect(
      findingSchema.safeParse({
        ...blankFinding(),
        section: "a",
        description: "b",
        due_date: "2026-02-30",
      }).success,
    ).toBe(false);
  });
});

it("preserves styled workbook bytes while adding embedded photo parts", async () => {
  const { default: XLSX } = await import("xlsx-js-style");
  const { attachSlaughterImages } = await import("./slaughter-images");
  const { default: JSZip } = await import("jszip");
  const book = maintenanceWorkbook(
    [{ ...blankFinding(), section: "أسماك", description: "عطل" }],
    "Maintenance",
  );
  const styled = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
  const bytes = await attachSlaughterImages(
    book,
    [
      {
        bytes: Uint8Array.from(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "base64",
          ),
        ),
        extension: "png",
        width: 1,
        height: 1,
      },
    ],
    styled,
  );
  const zip = await JSZip.loadAsync(bytes);
  expect(await zip.file("xl/styles.xml")!.async("string")).toContain("174D3A");
  expect(zip.file("xl/media/slaughter-1.png")).not.toBeNull();
  expect(await zip.file("xl/worksheets/sheet2.xml")!.async("string")).toContain(
    "rIdSlaughterPictures",
  );
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
const db = vi.hoisted(() => ({
  trace: [] as unknown[],
  nextId: 0,
  failAt: 0,
  errorAt: 0,
  rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: db.rpc,
    from(table: string) {
      const query = {
        insert(payload: unknown) {
          db.trace.push({ table, payload: structuredClone(payload) });
          return query;
        },
        select() {
          return query;
        },
        throwOnError() {
          return query;
        },
        single() {
          return query;
        },
        then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) {
          db.nextId++;
          if (db.nextId === db.errorAt)
            return Promise.reject({ message: "Permission denied", code: "42501" }).then(
              resolve,
              reject,
            );
          if (db.nextId === db.failAt)
            return Promise.reject(new Error("DB unavailable")).then(resolve, reject);
          return Promise.resolve({ data: { id: `created-${db.nextId}` }, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return query;
    },
  },
}));
import {
  importChecklistWorkbook,
  importChecklistFile,
  readChecklistFile,
  saveChecklistWorkbook,
  validateChecklistWorkbook,
} from "./checklist-import";
import { importChecklistWorkbook as beforeImport } from "./__fixtures__/pre-refactor-checklist-import";
function workbook(name: string, rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
}
const files = [
  workbook("Checklist_Master", [
    ["Title", "Department", "Header", "ItemText", "MaxScore"],
    ["1", "قسم أسماك", "نظافة", "السؤال الأول", 4],
    ["2", "قسم أسماك", "نظافة", "السؤال الثاني", 0],
    ["", "قسم آخر", "", "سؤال آخر", "bad"],
    ["", "", "", "يتجاهله", 4],
  ]),
  workbook("Sheet1", [
    ["ISO 22000"],
    [],
    [],
    [],
    [],
    [],
    [],
    ["1", "عنوان رئيسي", null, null],
    ["1.1", "سؤال المواصفة", 4, null],
    ["", "سؤال المستندات", null, 2],
  ]),
  workbook("بقالة", [
    ["قسم البقالة", "", "", "", "", "قسم التجارة الالكترونية"],
    [],
    [],
    [],
    [],
    [],
    [4, "", "السؤال الأول", "عنوان فرعي", "", 2, "", "عادات خاطئة", "عنوان آخر"],
    [0, "", "السؤال الثاني", "", "", 4, "", "سؤال التوصيل"],
  ]),
  workbook("Stores FS", [
    ["قسم الأسماك"],
    ["عنوان فرعي", null, null, null, null],
    [1, "سؤال التفتيش", null, 4, 4],
    [2, "سؤال آخر", null, 2, 2],
    ["اجمالي", "تجاهل هذا", null, 0, 0],
  ]),
];
beforeEach(() => {
  db.trace = [];
  db.nextId = 0;
  db.failAt = 0;
});
describe("checklist import behavior before and after refactoring", () => {
  it("preserves exact insert order, payloads, IDs, default scores and append counters for all four formats", async () => {
    for (const wb of files)
      for (const append of [false, true]) {
        const context = {
          typeId: "type",
          sectionCount: append ? 3 : 0,
          questionCount: append ? 7 : 0,
        };
        db.trace = [];
        db.nextId = 0;
        const before = await beforeImport(wb, context);
        const trace = structuredClone(db.trace);
        db.trace = [];
        db.nextId = 0;
        expect(await importChecklistWorkbook(wb, context)).toEqual(before);
        expect(db.trace).toEqual(trace);
        expect(before.totalQuestions).toBeGreaterThan(0);
      }
  });
  it("preserves real XLSX file reading and propagates a write failure without retrying earlier inserts", async () => {
    const wb = files[0]!;
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => buffer } as File;
    const context = { typeId: "type", sectionCount: 0, questionCount: 0 };
    expect((await importChecklistFile(file, context)).totalQuestions).toBe(3);
    db.trace = [];
    db.nextId = 0;
    db.failAt = 2;
    await expect(importChecklistWorkbook(wb, context)).rejects.toThrow("DB unavailable");
    expect(db.trace).toHaveLength(2);
  });
});

describe("checklist import failure boundaries", () => {
  it("rejects empty files before any write", async () => {
    const file = {
      arrayBuffer: async () =>
        XLSX.write(workbook("Empty", []), { type: "array", bookType: "xlsx" }),
    } as File;
    const before = db.trace.length;
    await expect(readChecklistFile(file)).rejects.toThrow("فارغ");
    expect(db.trace).toHaveLength(before);
  });
  it("stops import on a database permission error instead of counting unsaved rows", async () => {
    db.nextId = 0;
    db.errorAt = 3;
    try {
      await expect(
        importChecklistWorkbook(files[0]!, { typeId: "type", sectionCount: 0, questionCount: 0 }),
      ).rejects.toMatchObject({ code: "42501" });
      expect(db.nextId).toBe(3);
    } finally {
      db.errorAt = 0;
    }
  });
});

describe("checklist format preflight before replacement", () => {
  it("runs all existing formats without issuing database requests", async () => {
    const before = db.trace.length;
    for (const file of files) {
      const result = await validateChecklistWorkbook(file, {
        typeId: "type",
        sectionCount: 0,
        questionCount: 0,
      });
      expect(result.totalQuestions).toBeGreaterThan(0);
    }
    expect(db.trace).toHaveLength(before);
  });
  it("rejects readable workbooks with no importable questions without writes", async () => {
    const before = db.trace.length;
    await expect(
      validateChecklistWorkbook(workbook("Unsupported", [["Unrelated title"]]), {
        typeId: "type",
        sectionCount: 0,
        questionCount: 0,
      }),
    ).rejects.toThrow("لا يحتوي");
    expect(db.trace).toHaveLength(before);
  });
});

it("rejects an empty import locally and stages a valid workbook into one atomic request", async () => {
  db.rpc.mockReset();
  await expect(
    saveChecklistWorkbook(workbook("Unsupported", [["Unrelated title"]]), "type", true),
  ).rejects.toThrow("لا يحتوي");
  expect(db.rpc).not.toHaveBeenCalled();

  db.rpc.mockResolvedValue({ data: { totalSections: 2, totalQuestions: 3 }, error: null });
  const priorWrites = db.trace.length;
  await expect(saveChecklistWorkbook(files[0]!, "type", true)).resolves.toEqual({
    totalSections: 2,
    totalQuestions: 3,
  });
  expect(db.trace).toHaveLength(priorWrites);
  expect(db.rpc).toHaveBeenCalledTimes(1);
  const [name, { p_type_id, p_replace, p_rows }] = db.rpc.mock.calls[0]!;
  expect([name, p_type_id, p_replace]).toEqual(["sqop_import_checklist", "type", true]);
  for (const q of p_rows.questions)
    expect(p_rows.headers).toContainEqual(
      expect.objectContaining({ id: q.header_id, section_id: q.section_id }),
    );
});

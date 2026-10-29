import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as { table: string; method: string; args: unknown[] }[],
  tables: {} as Record<string, Record<string, unknown>[]>,
  blocked: {} as Record<string, Promise<void>>,
  errors: {} as Record<string, unknown>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const operations: { method: string; args: unknown[] }[] = [];
      const query: Record<string, unknown> = {};
      for (const method of ["select", "order", "range", "eq", "in", "gte", "lte", "abortSignal"]) {
        query[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args });
          operations.push({ method, args });
          return query;
        };
      }
      query["then"] = async (resolve: (value: unknown) => unknown) => {
        await state.blocked[table];
        if (state.errors[table]) return resolve({ data: null, error: state.errors[table] });
        let data = state.tables[table] ?? [];
        for (const operation of operations) {
          const [column, value] = operation.args;
          const get = (row: Record<string, unknown>) =>
            String(column)
              .split(".")
              .reduce<unknown>(
                (obj, key) =>
                  obj && typeof obj === "object"
                    ? (obj as Record<string, unknown>)[key]
                    : undefined,
                row,
              );
          if (operation.method === "eq") data = data.filter((row) => get(row) === value);
          if (operation.method === "in")
            data = data.filter((row) => (value as unknown[]).includes(get(row)));
          if (operation.method === "gte")
            data = data.filter((row) => String(get(row)) >= String(value));
          if (operation.method === "lte")
            data = data.filter((row) => String(get(row)) <= String(value));
          if (operation.method === "range") data = data.slice(Number(column), Number(value) + 1);
        }
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return query;
    },
  },
}));
import { fetchDashboardData } from "./data";

beforeEach(() => {
  state.calls = [];
  state.blocked = {};
  state.errors = {};
  state.tables = {
    branches: [
      { id: "a", name_ar: "فرع أ", code: "A" },
      { id: "wh", name_ar: "المخازن المركزية", code: "WH" },
    ],
    audit_types: [
      { id: "fs", code: "FS", name_ar: "سلامة الغذاء" },
      { id: "fs-wh", code: "FS (WH)" },
    ],
    audits: [
      {
        id: "current",
        audit_type_id: "fs",
        branch_id: "a",
        auditor_id: "user",
        audit_date: "2026-10-05",
      },
      {
        id: "old",
        audit_type_id: "fs",
        branch_id: "a",
        auditor_id: "user",
        audit_date: "2026-09-05",
      },
    ],
    sections: [{ id: "s", audit_type_id: "fs", active: true }],
    questions: [{ id: "q", audit_type_id: "fs", section_id: "s", active: true }],
    audit_answers: [
      {
        id: "answer",
        audit_id: "current",
        question_id: "q",
        score: 2,
        is_na: false,
        questions: { audit_type_id: "fs" },
      },
      {
        id: "foreign",
        audit_id: "current",
        question_id: "ghp-q",
        score: 4,
        is_na: false,
        questions: { audit_type_id: "ghp" },
      },
    ],
    audit_section_status: [],
    profiles: [],
  };
});

describe("bounded dashboard detail loading", () => {
  it("filters dates, location and program before fetching answers, and rejects foreign program rows", async () => {
    const data = await fetchDashboardData("branches", {
      start: "2026-10-01",
      end: "2026-10-31",
      branch: "a",
    });
    expect(data.audits.map((a) => a.id)).toEqual(["current"]);
    expect(data.answers.map((a) => a.id)).toEqual(["answer"]);
    expect(state.calls).toContainEqual({
      table: "audits",
      method: "gte",
      args: ["audit_date", "2026-10-01"],
    });
    expect(state.calls).toContainEqual({
      table: "audit_answers",
      method: "in",
      args: ["audit_id", ["current"]],
    });
    expect(state.calls).toContainEqual({
      table: "audit_answers",
      method: "eq",
      args: ["questions.audit_type_id", "fs"],
    });
  });
  it("does not request answers at all for the tracking tab", async () => {
    const data = await fetchDashboardData("branches", {
      start: "2026-10-01",
      end: "2026-10-31",
      branch: "all",
      includeAnswers: false,
    });
    expect(data.answers).toEqual([]);
    expect(state.calls.some((c) => c.table === "audit_answers")).toBe(false);
  });
  it("excludes N/A sections from issue details, matching the snapshot", async () => {
    state.tables["audit_section_status"] = [
      { id: "na", audit_id: "current", section_id: "s", is_na: true },
    ];
    expect(
      (
        await fetchDashboardData("branches", {
          start: "2026-10-01",
          end: "2026-10-31",
          branch: "all",
        })
      ).answers,
    ).toEqual([]);
  });
});

it("does not fetch another program's details when a program filter is selected", async () => {
  const data = await fetchDashboardData("branches", {
    start: "2026-10-01",
    end: "2026-10-31",
    branch: "all",
    program: "GHP",
  });
  expect(data.audits).toEqual([]);
  expect(data.auditTypes).toEqual([]);
  expect(state.calls.some((call) => call.table === "audit_answers")).toBe(false);
});

describe("dashboard detail scheduling and failure behavior", () => {
  it("loads excluded section flags while answers are still in flight", async () => {
    let release!: () => void;
    state.blocked["audit_answers"] = new Promise<void>((resolve) => {
      release = resolve;
    });
    const job = fetchDashboardData("branches", {
      start: "2026-10-01",
      end: "2026-10-31",
      branch: "all",
    });
    try {
      await vi.waitFor(() =>
        expect(state.calls.some((call) => call.table === "audit_section_status")).toBe(true),
      );
    } finally {
      release();
    }
    expect((await job).answers.map((answer) => answer.id)).toEqual(["answer"]);
  });
  it("keeps complete paginated answers and their original order", async () => {
    const first = state.tables["audit_answers"]![0]!;
    state.tables["audit_answers"] = Array.from({ length: 1001 }, (_, n) => ({
      ...first,
      id: `answer-${n}`,
    }));
    const result = await fetchDashboardData("branches", {
      start: "2026-10-01",
      end: "2026-10-31",
      branch: "all",
    });
    expect(result.answers.map((answer) => answer.id)).toEqual(
      state.tables["audit_answers"].map((answer) => answer["id"]),
    );
    expect(
      state.calls
        .filter((call) => call.table === "audit_answers" && call.method === "range")
        .map((call) => call.args),
    ).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });
  it("propagates a status lookup error rather than returning partially scored details", async () => {
    const error = { code: "42501", message: "Forbidden" };
    state.errors["audit_section_status"] = error;
    await expect(fetchDashboardData("branches")).rejects.toBe(error);
  });
  it("does not start requests for an already cancelled filter and rejects a late cancelled response", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(fetchDashboardData("branches", undefined, cancelled.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(state.calls).toEqual([]);
    let release!: () => void;
    state.blocked["audit_answers"] = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    const job = fetchDashboardData("branches", undefined, controller.signal);
    await vi.waitFor(() =>
      expect(state.calls.some((call) => call.table === "audit_answers")).toBe(true),
    );
    controller.abort();
    release();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("never loads audit answers for branches excluded from a manager's scope", async () => {
  const result = await fetchDashboardData("branches", {
    start: "",
    end: "",
    branch: "all",
    allowedBranchIds: [],
  });
  expect(result.branches).toEqual([]);
  expect(result.audits).toEqual([]);
  expect(state.calls.some((call) => call.table === "audit_answers")).toBe(false);
});
it("requests only the six answer fields needed for the dashboard, with a count for parallel paging", async () => {
  await fetchDashboardData("branches");
  expect(
    state.calls.find((call) => call.table === "audit_answers" && call.method === "select")?.args,
  ).toEqual([
    "id, audit_id, question_id, score, is_na, comment, questions!inner(audit_type_id)",
    { count: "exact" },
  ]);
});

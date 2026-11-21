import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  correctionPermission,
  correctionRecipients,
  saveCorrectionPermission,
} from "./correction-email.server";
import type { AppDatabase } from "@/integrations/supabase/app-schema";
import { ncrBranches, ncrAnalysis, ncrRecipients } from "./ncr-management.server";
import type { ServerActor } from "./server-access.server";

const id = (n: number) => `59432010-0000-4000-8000-${String(n).padStart(12, "0")}`;
const manager: ServerActor = { id: id(1), role: "manager" };
const admin: ServerActor = { id: id(2), role: "admin" };
const start = "2026-11-01",
  end = "2026-11-30";
function fixture(
  options: {
    ncr?: boolean;
    audits?: boolean;
    correction?: boolean;
    signedInForCorrection?: boolean;
  } = {},
) {
  const audits = [
    {
      id: id(40),
      branch_id: id(10),
      audit_type_id: id(20),
      score: 79,
      status: "submitted",
      audit_date: start,
      created_by: id(3),
      auditor_id: id(3),
      audit_types: { code: "FS" },
    },
    {
      id: id(41),
      branch_id: id(11),
      audit_type_id: id(20),
      score: 65,
      status: "submitted",
      audit_date: start,
      created_by: id(3),
      auditor_id: id(3),
      audit_types: { code: "FS" },
    },
    {
      id: id(42),
      branch_id: id(10),
      audit_type_id: id(20),
      score: 50,
      status: "draft",
      audit_date: start,
      created_by: id(1),
      auditor_id: id(1),
      audit_types: { code: "FS" },
    },
    {
      id: id(43),
      branch_id: id(10),
      audit_type_id: id(21),
      score: 89,
      status: "submitted",
      audit_date: start,
      created_by: id(3),
      auditor_id: id(3),
      audit_types: { code: "GHP" },
    },
  ];
  const answer = (n: number, section: number, score: number | null, is_na = false, type = 20) => ({
    id: id(n + 100),
    audit_id: id(40),
    question_id: id(n),
    is_na,
    score,
    comment: "تاريخ غير واضح",
    questions: {
      id: id(n),
      audit_type_id: id(type),
      item_id: "FS-" + n,
      section_id: id(section),
      text_ar: "بيانات التاريخ",
      max_score: 4,
      sections: { name_ar: "المخبوزات" },
    },
  });
  const tables: Record<string, Record<string, unknown>[]> = {
    branches: [
      { id: id(10), name_ar: "فرع مصرح", active: true },
      { id: id(11), name_ar: "فرع مقيد", active: true },
      { id: id(12), name_ar: "المخازن المركزية", active: true },
    ],
    audits,
    audit_types: [
      { id: id(20), code: "FS" },
      { id: id(21), code: "GHP" },
    ],
    user_section_access: [
      { section_key: "ncr_management", user_id: id(1), visible: options.ncr ?? true },
      { section_key: "audits", user_id: id(1), visible: options.audits ?? true },
    ],
    audit_share_members: [],
    manager_audit_branch_scopes: [{ user_id: id(1), branch_ids: [id(10)] }],
    audit_section_status: [{ audit_id: id(40), section_id: id(52), is_na: true }],
    audit_answers: [
      answer(60, 51, 0),
      answer(61, 51, null),
      answer(62, 51, 2, true),
      answer(63, 52, 1),
      answer(64, 51, 4),
      answer(65, 51, 1, false, 21),
    ],
    branch_email_recipients: [
      { branch_id: id(10), to_addresses: ["to@example.test"], cc_addresses: ["cc@example.test"] },
    ],
    audit_correction_email_settings: [
      {
        id: true,
        roles: options.correction ? ["manager"] : [],
        user_ids: options.signedInForCorrection ? [id(1)] : [],
      },
    ],
  };
  const calls: { table: string; method: string; pins: string | null }[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!,
      method = init?.method ?? "GET";
    const string = (data: unknown) =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    calls.push({ table, method, pins: url.searchParams.get("audit_id") });
    const rows = (tables[table] ?? []).filter((row) =>
      [...url.searchParams].every(([k, val]) => {
        if (val.startsWith("eq.")) return String(row[k]) === val.slice(3);
        if (val.startsWith("in.(")) return val.slice(4, -1).split(",").includes(String(row[k]));
        if (val.startsWith("gte.")) return String(row[k]) >= val.slice(4);
        if (val.startsWith("lte.")) return String(row[k]) <= val.slice(4);
        if (k === "or")
          return val.includes(String(row["created_by"])) || val.includes(String(row["auditor_id"]));
        return true;
      }),
    );
    const accept = new Headers(init?.headers).get("accept");
    return string(accept?.includes("vnd.pgrst.object+json") ? (rows[0] ?? null) : rows);
  });
  const db = createClient<AppDatabase>("https://example.test", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mock },
  });
  return { db, calls };
}

describe("report feature permissions and saved audit evidence", () => {
  it("denies a hidden section and never loads audit or recipients data", async () => {
    const { db, calls } = fixture({ ncr: false });
    await expect(ncrBranches(db, manager)).rejects.toThrow("غير مصرح");
    await expect(ncrRecipients(db, manager, id(10))).rejects.toThrow("غير مصرح");
    expect(calls.every((entry) => entry.table === "user_section_access")).toBe(true);
  });
  it("keeps branch scope, approved status and FS/GHP filters when analytics reads saved answers", async () => {
    const { db, calls } = fixture();
    expect((await ncrBranches(db, manager)).map((b) => b.id)).toEqual([id(10)]);
    await expect(
      ncrAnalysis(db, manager, { start, end, branchId: id(11), program: "both" }),
    ).rejects.toThrow("لا تملك");
    const report = await ncrAnalysis(db, manager, { start, end, branchId: id(10), program: "FS" });
    expect(report.audits.map((entry) => entry.id)).toEqual([id(40)]);
    expect(report.findings).toMatchObject([{ questionId: id(60), earned: 0 }]);
    expect(report.unresolved).toBe(1);
    expect(
      calls.filter((entry) => entry.table === "audit_answers").map((entry) => entry.pins),
    ).toEqual([`in.(${id(40)})`]);
    const both = await ncrAnalysis(db, manager, { start, end, branchId: id(10), program: "both" });
    expect(both.audits.map((entry) => entry.program)).toEqual(["FS", "GHP"]);
    expect(await ncrRecipients(db, manager, id(10))).toEqual({
      configured: true,
      to_addresses: ["to@example.test"],
    });
  });
  it("makes correction email opt-in, admin-only to configure, and limited to approved visible audits", async () => {
    const off = fixture();
    expect((await correctionPermission(off.db, admin)).allowed).toBe(false);
    expect((await correctionPermission(off.db, manager)).allowed).toBe(false);
    await expect(correctionRecipients(off.db, manager, id(40))).rejects.toThrow("غير متاحة");
    await expect(
      saveCorrectionPermission(off.db, manager, { roles: [], user_ids: [] }),
    ).rejects.toThrow("مدير النظام");
    expect(off.calls.every((entry) => entry.method === "GET")).toBe(true);
    const grant = fixture({ signedInForCorrection: true });
    expect(await correctionPermission(grant.db, manager)).toMatchObject({
      allowed: true,
      roles: null,
      user_ids: null,
    });
    expect(await correctionRecipients(grant.db, manager, id(40))).toMatchObject({
      to_addresses: ["to@example.test"],
      cc_addresses: ["cc@example.test"],
    });
    await expect(correctionRecipients(grant.db, manager, id(42))).rejects.toThrow("المعتمد");
    await expect(correctionRecipients(grant.db, manager, id(41))).rejects.toThrow("المسموح");
    const hidden = fixture({ correction: true, audits: false });
    await expect(correctionRecipients(hidden.db, manager, id(40))).rejects.toThrow("غير متاحة");
  });
});

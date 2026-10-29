import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { snapshotAuditScore, type DashboardSnapshot } from "./snapshot";

// Optional real PostgreSQL/WASM check. Install @electric-sql/pglite outside the app
// and set SQOP_PGLITE_MODULE to its absolute dist/index.js; no production dependency.
const modulePath = process.env["SQOP_PGLITE_MODULE"];
interface TestDb {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe.skipIf(!modulePath)("dashboard RPC in isolated PostgreSQL", () => {
  let db: TestDb;
  beforeAll(async () => {
    const { PGlite } = (await import(/* @vite-ignore */ modulePath!)) as {
      PGlite: new () => TestDb;
    };
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY, active boolean);
      CREATE TABLE user_roles(user_id uuid PRIMARY KEY, role text);
      CREATE TABLE branches(id uuid PRIMARY KEY, name_ar text, code text, active boolean);
      CREATE TABLE audit_types(id uuid PRIMARY KEY, code text, name_ar text, name_en text);
      CREATE TABLE audits(id uuid PRIMARY KEY, audit_date date, status text, branch_id uuid, audit_type_id uuid, score numeric);
      CREATE TABLE sections(id uuid PRIMARY KEY, audit_type_id uuid, name_ar text, name_en text, is_delivery boolean, active boolean);
      CREATE TABLE questions(id uuid PRIMARY KEY, section_id uuid, audit_type_id uuid, max_score integer, active boolean, text_ar text DEFAULT '');
      CREATE TABLE audit_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), audit_id uuid, question_id uuid, score integer, is_na boolean, UNIQUE(audit_id, question_id));
      CREATE TABLE audit_section_status(audit_id uuid, section_id uuid, is_na boolean, UNIQUE(audit_id, section_id));
      CREATE TABLE audit_section_deductions(audit_id uuid, section_id uuid, percentage numeric);
      CREATE TABLE audit_general_deductions(audit_id uuid, percentage numeric);
      INSERT INTO profiles VALUES ('${id(1)}', true), ('${id(2)}', true), ('${id(3)}', true), ('${id(4)}', false);
      INSERT INTO user_roles VALUES ('${id(1)}', 'admin'), ('${id(2)}', 'manager'), ('${id(3)}', 'auditor'), ('${id(4)}', 'admin');
      INSERT INTO branches VALUES ('${id(10)}', 'فرع عادي', 'A', true), ('${id(11)}', 'دارك ستور زايد', 'D', true), ('${id(12)}', 'المخازن المركزية', 'WH', true);
      INSERT INTO audit_types VALUES ('${id(20)}', 'FS', 'سلامة الغذاء', 'Food Safety'), ('${id(21)}', 'GHP', 'النظافة', 'GHP'), ('${id(22)}', 'FS (WH)', 'سلامة الغذاء مخازن', 'Food Safety WH');
      INSERT INTO audits VALUES ('${id(30)}', '2026-10-05', 'submitted', '${id(10)}', '${id(20)}', 99),
        ('${id(31)}', '2026-09-05', 'draft', '${id(10)}', '${id(20)}', 99),
        ('${id(32)}', '2026-10-06', 'submitted', '${id(12)}', '${id(22)}', 99);
      INSERT INTO sections VALUES ('${id(40)}', '${id(20)}', 'رئيسي', null, false, true),
        ('${id(41)}', '${id(20)}', 'التوصيل', null, true, true),
        ('${id(42)}', '${id(20)}', 'مستثنى', null, false, true),
        ('${id(43)}', '${id(21)}', 'GHP', null, false, true);
      INSERT INTO questions(id, section_id, audit_type_id, max_score, active) VALUES
        ('${id(50)}', '${id(40)}', '${id(20)}', 4, true),
        ('${id(51)}', '${id(40)}', '${id(20)}', 2, true),
        ('${id(52)}', '${id(40)}', '${id(20)}', 4, true),
        ('${id(53)}', '${id(40)}', '${id(20)}', 4, true),
        ('${id(54)}', '${id(40)}', '${id(20)}', 4, false),
        ('${id(55)}', '${id(41)}', '${id(20)}', 4, true),
        ('${id(56)}', '${id(42)}', '${id(20)}', 4, true),
        ('${id(57)}', '${id(43)}', '${id(21)}', 4, true);
      INSERT INTO audit_answers(audit_id, question_id, score, is_na) VALUES
        ('${id(30)}', '${id(50)}', 2, false),
        ('${id(30)}', '${id(51)}', null, false),
        ('${id(30)}', '${id(52)}', null, true),
        ('${id(30)}', '${id(55)}', 0, false),
        ('${id(30)}', '${id(56)}', 0, false),
        ('${id(30)}', '${id(57)}', 0, false);
      INSERT INTO audit_section_status VALUES ('${id(30)}', '${id(42)}', true);
      INSERT INTO audit_section_deductions VALUES ('${id(30)}', '${id(40)}', 10), ('${id(30)}', '${id(40)}', 2.5);
      INSERT INTO audit_general_deductions VALUES ('${id(30)}', 7.25);
    `);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/proposals/2026-10-24_manager_dashboard_REVIEW_ONLY.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }, 30_000);
  beforeEach(async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(1)]);
  });
  afterAll(async () => {
    await db?.close();
  });
  async function snapshot(
    scope = "branches",
    start: string | null = "2026-10-01",
    end = "2026-10-31",
    branch: string | null = null,
  ) {
    const result = await db.query<{ data: DashboardSnapshot }>(
      "SELECT public.sqop_dashboard_snapshot($1, $2::date, $3::date, $4::uuid) AS data",
      [scope, start, end, branch],
    );
    return result.rows[0]!.data;
  }
  it("executes the real SQL and preserves defaults, N/A, exclusions, section/general deductions", async () => {
    const data = await snapshot();
    expect(data.audits).toHaveLength(1);
    const audit = data.audits[0]!;
    expect(snapshotAuditScore(audit)).toEqual({ before: 75, after: 55.25 });
    expect(audit.sections.find((s) => s.id === id(40))).toMatchObject({
      maximum: 8,
      earned: 6,
      deduction: 12.5,
    });
    expect(audit.sections.find((s) => s.id === id(42))?.nonCompliant).toBe(0);
    expect(JSON.stringify(data)).not.toContain("question_id");
  });
  it("does not transfer or count unrelated answer rows as the database grows", async () => {
    const before = await snapshot();
    await db.exec(`WITH added AS (
      INSERT INTO questions(id, section_id, audit_type_id, max_score, active)
      SELECT gen_random_uuid(), '${id(43)}'::uuid, '${id(21)}'::uuid, 4, true
      FROM generate_series(1, 1000) RETURNING id
    ) INSERT INTO audit_answers(audit_id, question_id, score, is_na)
      SELECT '${id(30)}'::uuid, id, 0, false FROM added`);
    expect(await snapshot()).toEqual(before);
  });
  it("runs for authenticated managers without granting them table access", async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(2)]);
    await db.exec("SET ROLE authenticated");
    try {
      expect((await snapshot()).audits).toHaveLength(1);
      expect((await snapshot("branches", "2026-09-01", "2026-09-30")).audits).toEqual([]);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("reflects edited answers immediately without changing the stored audit score", async () => {
    await db.exec(
      `UPDATE audit_answers SET score = 0 WHERE audit_id = '${id(30)}' AND question_id = '${id(50)}'`,
    );
    try {
      expect(snapshotAuditScore((await snapshot()).audits[0]!)?.after).toBe(30.25);
      expect(
        (await db.query<{ score: string }>(`SELECT score FROM audits WHERE id = '${id(30)}'`))
          .rows[0]?.score,
      ).toBe("99");
    } finally {
      await db.exec(
        `UPDATE audit_answers SET score = 2 WHERE audit_id = '${id(30)}' AND question_id = '${id(50)}'`,
      );
    }
  });
  it("keeps warehouse scope, branch and dates isolated", async () => {
    expect((await snapshot("warehouses")).audits[0]?.id).toBe(id(32));
    expect((await snapshot("branches", "2026-10-01", "2026-10-31", id(11))).audits).toEqual([]);
    expect((await snapshot("branches", "2026-09-01", "2026-09-30")).audits[0]?.status).toBe(
      "draft",
    );
  });
  it("allows active managers and rejects auditors, inactive admins and missing authentication", async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(2)]);
    expect((await snapshot()).audits).toHaveLength(1);
    for (const user of [id(3), id(4), ""]) {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
      await expect(snapshot()).rejects.toThrow("Dashboard access denied");
    }
  });
  it("rejects bad ranges/scopes and revokes anonymous EXECUTE", async () => {
    await expect(snapshot("anything")).rejects.toThrow("Invalid location scope");
    await expect(snapshot("branches", "2026-11-01", "2026-10-01")).rejects.toThrow(
      "Invalid date range",
    );
    const acl = await db.query<{ allowed: boolean }>(
      "SELECT has_function_privilege('anon', 'public.sqop_dashboard_snapshot(text,date,date,uuid)', 'EXECUTE') AS allowed",
    );
    expect(acl.rows[0]?.allowed).toBe(false);
  });
});

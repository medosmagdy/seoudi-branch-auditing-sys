import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const modulePath = process.env["SQOP_PGLITE_MODULE"];
const id = (n: number) => `12345678-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Db = {
  exec(statement: string): Promise<unknown>;
  query<R = Record<string, unknown>>(statement: string, args?: unknown[]): Promise<{ rows: R[] }>;
  close(): Promise<void>;
};
describe.skipIf(!modulePath)("QA release proposals on isolated PostgreSQL", () => {
  let db: Db;
  let access: string, imports: string;
  const run = (name: string) =>
    readFile(new URL(`../../supabase/proposals/${name}`, import.meta.url), "utf8");
  async function login(userId: number | null) {
    await db.exec(`RESET ROLE; SET ROLE ${userId === null ? "anon" : "authenticated"}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      userId === null ? "" : id(userId),
    ]);
  }
  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,active boolean);
      CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY,role text);
      CREATE TABLE public.branches(id uuid PRIMARY KEY);
      CREATE TABLE public.audit_types(id uuid PRIMARY KEY);
      CREATE TABLE public.sections(id uuid PRIMARY KEY,audit_type_id uuid NOT NULL REFERENCES audit_types, name_ar text NOT NULL, order_index integer,is_delivery boolean,active boolean);
      CREATE TABLE public.headers(id uuid PRIMARY KEY,section_id uuid NOT NULL REFERENCES sections,label_ar text,order_index integer);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,audit_type_id uuid REFERENCES audit_types,section_id uuid REFERENCES sections,header_id uuid NOT NULL REFERENCES headers,item_id text NOT NULL,text_ar text NOT NULL,max_score integer,item_order integer,active boolean);
      CREATE TABLE public.audits(id uuid PRIMARY KEY,created_by uuid,auditor_id uuid,branch_id uuid REFERENCES branches,audit_type_id uuid NOT NULL REFERENCES audit_types,status text,audit_date date,created_at timestamp,version integer,score numeric,overall_score numeric,submitted_at timestamptz,edited_at timestamptz);
      CREATE TABLE public.audit_answers(id uuid PRIMARY KEY,audit_id uuid NOT NULL REFERENCES audits,question_id uuid NOT NULL REFERENCES questions,score integer,is_na boolean,comment text);
      CREATE TABLE public.audit_section_status(id uuid PRIMARY KEY,audit_id uuid NOT NULL REFERENCES audits,section_id uuid NOT NULL REFERENCES sections,is_na boolean);
      CREATE TABLE public.audit_edit_logs(id uuid PRIMARY KEY,audit_id uuid,user_id uuid);
      CREATE TABLE public.monthly_branch_tracking(id uuid PRIMARY KEY,branch_id uuid);
      CREATE TABLE public.expiry_records(id uuid PRIMARY KEY,created_by uuid,review_status text);
      CREATE TABLE public.expiry_record_images(id uuid PRIMARY KEY,expiry_record_id uuid REFERENCES expiry_records ON DELETE CASCADE);
      CREATE TABLE public.audit_share_members(group_id uuid NOT NULL,user_id uuid NOT NULL);
      CREATE TABLE public.manager_audit_branch_scopes(user_id uuid PRIMARY KEY,branch_ids uuid[]);
      CREATE FUNCTION public.sqop_manager_can_read_branch(branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
        SELECT NOT EXISTS(SELECT 1 FROM public.manager_audit_branch_scopes WHERE user_id=auth.uid())
          OR EXISTS(SELECT 1 FROM public.manager_audit_branch_scopes WHERE user_id=auth.uid() AND branch=ANY(branch_ids))
      $$;
      CREATE FUNCTION public.set_user_role(uid uuid, next text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.user_roles SET role=next WHERE user_id=uid $$;
    `);
    for (const name of [
      "audit_section_deductions",
      "audit_general_deductions",
      "photos",
      "reports",
      "general_deductions",
      "section_deductions",
    ]) {
      await db.exec(
        `CREATE TABLE public.${name}(id uuid PRIMARY KEY,audit_id uuid REFERENCES audits)`,
      );
    }
    await db.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC,anon,authenticated");
    for (const [n, role, active] of [
      [1, "admin", true],
      [2, "manager", true],
      [3, "auditor", true],
      [4, "auditor", true],
      [5, "admin", false],
      [6, "auditor", true],
    ] as const) {
      await db.query("insert into auth.users values($1)", [id(n)]);
      await db.query("insert into profiles values($1,$2,$3)", [id(n), `person-${n}`, active]);
      await db.query("insert into user_roles values($1,$2)", [id(n), role]);
    }
    await db.query("insert into branches values($1),($2)", [id(10), id(11)]);
    await db.query("insert into manager_audit_branch_scopes values($1,$2::uuid[])", [
      id(2),
      [id(10)],
    ]);
    await db.query("insert into monthly_branch_tracking values($1,$2),($3,$4)", [
      id(25),
      id(10),
      id(26),
      id(11),
    ]);
    await db.query("insert into audit_types values($1),($2)", [id(20), id(21)]);
    await db.query(
      "insert into sections values($1,$2,'FS',0,false,true),($3,$4,'Previous checklist',0,false,true)",
      [id(30), id(20), id(31), id(21)],
    );
    await db.query("insert into headers values($1,$2,'Header',0),($3,$4,'Original',0)", [
      id(40),
      id(30),
      id(41),
      id(31),
    ]);
    await db.query(
      "insert into questions values($1,$2,$3,$4,'A','text',4,0,true),($5,$6,$7,$8,'B','old text',4,0,true)",
      [id(45), id(20), id(30), id(40), id(46), id(21), id(31), id(41)],
    );
    for (const [audit, owner, branch, status, day] of [
      [51, 3, 10, "submitted", 1],
      [52, 4, 11, "submitted", 2],
      [53, 3, 11, "draft", 3],
      [54, 2, 11, "draft", 4],
      [55, 4, 10, "draft", 5],
    ] as const) {
      await db.query(
        "insert into audits(id,created_by,auditor_id,branch_id,audit_type_id,status,audit_date,created_at,score) values($1,$2,$2,$3,$4,$5,$6,$6::date,72)",
        [id(audit), id(owner), id(branch), id(20), status, `2026-11-0${day}`],
      );
    }
    await db.query(
      "insert into audit_answers values($1,$2,$3,null,true,'previous confidential note'),($4,$5,$3,0,false,'peer')",
      [id(61), id(51), id(45), id(62), id(52)],
    );
    await db.query("insert into audit_section_status values($1,$2,$3,true)", [
      id(63),
      id(51),
      id(30),
    ]);
    await db.query("insert into audit_share_members values($1,$2),($1,$3)", [id(70), id(4), id(6)]);
    await db.query("insert into expiry_records values($1,$2,'pending')", [id(80), id(4)]);
    access = await run("2026-11-21_core_access_and_na_REVIEW_ONLY.sql");
    imports = await run("2026-11-21_atomic_checklist_import_REVIEW_ONLY.sql");
    await db.exec(access);
    await db.exec(imports);
  }, 30000);
  afterAll(async () => db?.close());

  it("denies anonymous and inactive access at the database", async () => {
    await login(null);
    for (const table of [
      "audits",
      "audit_answers",
      "photos",
      "user_roles",
      "profiles",
      "expiry_records",
    ])
      await expect(db.query(`select 1 from public.${table}`)).rejects.toThrow("permission denied");
    await expect(db.query("select public.delete_user_completely($1)", [id(4)])).rejects.toThrow(
      "permission denied",
    );
    await login(5);
    expect((await db.query("select id from audits")).rows).toEqual([]);
    expect((await db.query("select id from expiry_records")).rows).toEqual([]);
    await expect(db.query("select public.delete_user_completely($1)", [id(4)])).rejects.toThrow(
      "active administrator",
    );
  });

  it("honors manager branch filters, own drafts, and the official insert/returning and reopen paths", async () => {
    await login(2);
    expect((await db.query("select id from audits order by id")).rows).toEqual(
      [51, 54].map((n) => ({ id: id(n) })),
    );
    expect((await db.query("select id from monthly_branch_tracking")).rows).toEqual([
      { id: id(25) },
    ]);
    expect(
      (await db.query("update audits set version=2 where id=$1 returning id", [id(51)])).rows,
    ).toEqual([]);
    expect(
      (await db.query("update audits set version=2 where id=$1 returning id", [id(54)])).rows,
    ).toEqual([{ id: id(54) }]);
    expect(
      (
        await db.query(
          "insert into audits(id,auditor_id,branch_id,audit_type_id,status) values($1,$2,$3,$4,'draft') returning id",
          [id(56), id(2), id(10), id(20)],
        )
      ).rows,
    ).toEqual([{ id: id(56) }]);
  });

  it("shares an audit and its existing child rows without opening audit reassignment or account roles", async () => {
    await login(6);
    expect((await db.query("select id from audits order by id")).rows).toEqual(
      [52, 55].map((n) => ({ id: id(n) })),
    );
    expect(
      (await db.query("update audit_answers set score=0 where id=$1 returning id", [id(62)])).rows,
    ).toEqual([{ id: id(62) }]);
    await expect(
      db.query("update audits set branch_id=$1 where id=$2", [id(10), id(52)]),
    ).rejects.toThrow("permission denied");
    expect((await db.query("select user_id from user_roles")).rows).toEqual([{ user_id: id(6) }]);
    expect((await db.query("update user_roles set role='admin' returning user_id")).rows).toEqual(
      [],
    );
  });

  it("returns only cross-owner N/A flags needed for the new draft", async () => {
    await db.exec("RESET ROLE");
    // Use the previous visit from an independently unreadable audit.
    await db.query(
      "update audits set audit_date='2026-10-29',created_at='2026-10-29' where id=$1",
      [id(56)],
    );
    await login(4);
    expect((await db.query("select id from audit_answers where id=$1", [id(61)])).rows).toEqual([]);
    expect((await db.query("select sqop_audit_na_defaults($1) as result", [id(55)])).rows).toEqual([
      {
        result: {
          answers: [{ question_id: id(45), score: null, is_na: true, comment: null }],
          statuses: [{ section_id: id(30), is_na: true }],
        },
      },
    ]);
    await expect(db.query("select sqop_audit_na_defaults($1)", [id(53)])).rejects.toThrow(
      "Audit edit access required",
    );
  });

  it("keeps expiry review and delete admin-only while allowing the owner to save a draft", async () => {
    await login(4);
    expect(
      (await db.query("update expiry_records set review_status='pending' returning id")).rows,
    ).toEqual([{ id: id(80) }]);
    await expect(db.query("update expiry_records set review_status='reviewed'")).rejects.toThrow(
      "row-level security",
    );
    expect((await db.query("delete from expiry_records returning id")).rows).toEqual([]);
    await login(1);
    expect(
      (await db.query("update expiry_records set review_status='reviewed' returning id")).rows,
    ).toEqual([{ id: id(80) }]);
  });

  const manifest = (n: number, bad = false) => ({
    sections: [{ id: id(n), name_ar: "New", order_index: 0 }],
    headers: [{ id: id(n + 1), section_id: id(n), label_ar: "New", order_index: 0 }],
    questions: [
      {
        id: id(n + 2),
        section_id: id(n),
        header_id: id(n + 1),
        item_id: "QA",
        text_ar: "Valid",
        max_score: bad ? -1 : 4,
        item_order: 0,
      },
    ],
  });
  const importList = (program: number, replace: boolean, n: number, bad = false) =>
    db.query("select sqop_import_checklist($1,$2,$3::jsonb) as result", [
      id(program),
      replace,
      JSON.stringify(manifest(n, bad)),
    ]);

  it("rejects non-admin imports and preserves existing audit denominators", async () => {
    await login(2);
    await expect(importList(21, true, 100)).rejects.toThrow("Active administrator");
    await login(1);
    await expect(importList(20, false, 100)).rejects.toThrow("saved audits");
    await expect(importList(20, true, 100)).rejects.toThrow("saved audits");
    expect((await db.query("select active from questions where id=$1", [id(45)])).rows).toEqual([
      { active: true },
    ]);
    expect((await db.query("select score from audits where id=$1", [id(51)])).rows).toEqual([
      { score: "72" },
    ]);
  });

  it("rolls back deactivation and all inserts if the last stage of replacement fails", async () => {
    await login(1);
    await expect(importList(21, true, 100, true)).rejects.toThrow(
      "invalid header, code, text, or score",
    );
    expect(
      (await db.query("select id,active from sections where audit_type_id=$1", [id(21)])).rows,
    ).toEqual([{ id: id(31), active: true }]);
    expect((await db.query("select id from headers where id=$1", [id(101)])).rows).toEqual([]);
    expect((await importList(21, true, 100)).rows).toEqual([
      { result: { totalSections: 1, totalQuestions: 1 } },
    ]);
    expect(
      (
        await db.query("select id,active from sections where audit_type_id=$1 order by id", [
          id(21),
        ])
      ).rows,
    ).toEqual([
      { id: id(31), active: false },
      { id: id(100), active: true },
    ]);
    expect((await importList(21, false, 110)).rows).toEqual([
      { result: { totalSections: 1, totalQuestions: 1 } },
    ]);
    expect(
      (await db.query("select order_index from sections where id=$1", [id(110)])).rows,
    ).toEqual([{ order_index: 1 }]);
  });
});

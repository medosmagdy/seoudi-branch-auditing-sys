import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
interface Db {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tables = [
  "profiles",
  "user_roles",
  "branches",
  "audit_types",
  "sections",
  "headers",
  "questions",
  "audits",
  "audit_answers",
  "audit_section_status",
  "audit_section_deductions",
  "audit_general_deductions",
  "photos",
  "reports",
  "audit_edit_logs",
  "general_deductions",
  "section_deductions",
  "monthly_branch_tracking",
];
describe.skipIf(!modulePath)(
  "REVIEW-ONLY access proposal in isolated PostgreSQL; never connected production",
  () => {
    let db: Db, proposal: string;
    async function login(n: number | null, role = "authenticated") {
      await db.exec(`RESET ROLE; SET ROLE ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        n === null ? "" : id(n),
      ]);
    }
    beforeAll(async () => {
      const { PGlite } = await import(/* @vite-ignore */ modulePath!);
      db = new PGlite();
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,active boolean);
      CREATE TABLE public.user_roles(user_id uuid PRIMARY KEY,role text);
      CREATE TABLE public.audits(id uuid PRIMARY KEY,created_by uuid,auditor_id uuid,status text DEFAULT 'submitted');
      CREATE TABLE public.audit_edit_logs(id uuid PRIMARY KEY,audit_id uuid,user_id uuid);
      CREATE TABLE public.monthly_branch_tracking(id uuid PRIMARY KEY,branch_id uuid,fs_status text);
      ALTER TABLE public.monthly_branch_tracking ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "monthly tracking authenticated access" ON public.monthly_branch_tracking FOR ALL TO authenticated USING(true) WITH CHECK(true);
      CREATE FUNCTION public.assign_role(new_role text,target_uid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN UPDATE public.user_roles SET role=new_role WHERE user_id=target_uid; RETURN true; END $$;
    `);
      for (const name of tables.filter(
        (name) =>
          ![
            "profiles",
            "user_roles",
            "audits",
            "audit_edit_logs",
            "monthly_branch_tracking",
          ].includes(name),
      )) {
        await db.exec(`CREATE TABLE public.${name}(id uuid PRIMARY KEY,audit_id uuid);`);
      }
      await db.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;");
      for (const [n, role, active] of [
        [1, "admin", true],
        [2, "admin", true],
        [3, "manager", true],
        [4, "auditor", true],
        [5, "auditor", true],
        [6, "admin", false],
      ] as const) {
        await db.query("insert into auth.users values($1)", [id(n)]);
        await db.query("insert into profiles values($1,$2,$3)", [id(n), `user-${n}`, active]);
        await db.query("insert into user_roles values($1,$2)", [id(n), role]);
      }
      await db.query(
        "insert into audits(id,created_by,auditor_id) values($1,$2,$2),($3,$4,$4),($5,$6,$6)",
        [id(10), id(4), id(11), id(5), id(12), id(3)],
      );
      await db.query("insert into audit_answers values($1,$2),($3,$4)", [
        id(20),
        id(10),
        id(21),
        id(11),
      ]);
      await db.query("insert into monthly_branch_tracking values($1,$2,'not_started')", [
        id(30),
        id(31),
      ]);
      proposal = await readFile(
        new URL(
          "../../supabase/proposals/2026-10-24_access_hardening_REVIEW_ONLY.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(proposal);
    });
    afterAll(async () => {
      await db?.close();
    });
    it("revokes anonymous data access and prevents legacy privileged role RPC calls", async () => {
      await login(null, "anon");
      for (const name of tables)
        await expect(db.query(`select * from public.${name}`)).rejects.toThrow("permission denied");
      await expect(db.query("select public.assign_role('admin',$1)", [id(4)])).rejects.toThrow(
        "permission denied",
      );
      await login(4);
      await expect(db.query("select public.assign_role('admin',$1)", [id(4)])).rejects.toThrow(
        "permission denied",
      );
    });
    it("limits auditors to their audits and answers and blocks role escalation or self-activation", async () => {
      await login(4);
      expect((await db.query("select id from audits")).rows).toEqual([{ id: id(10) }]);
      expect((await db.query("select id from audit_answers")).rows).toEqual([{ id: id(20) }]);
      await expect(
        db.query("update user_roles set role='admin' where user_id=$1", [id(4)]),
      ).resolves.toMatchObject({ rows: [] });
      expect(
        (await db.query("select role from user_roles where user_id=$1", [id(4)])).rows[0],
      ).toEqual({ role: "auditor" });
      await expect(
        db.query("update profiles set active=true where id=$1", [id(4)]),
      ).rejects.toThrow("permission denied");
      await db.query("update profiles set full_name='renamed' where id=$1", [id(4)]);
      expect(
        (await db.query("select full_name from profiles where id=$1", [id(4)])).rows[0],
      ).toEqual({ full_name: "renamed" });
      await db.query("insert into audits(id,auditor_id) values($1,$2)", [id(13), id(4)]);
      await expect(
        db.query("insert into audits(id,auditor_id) values($1,$2)", [id(14), id(5)]),
      ).rejects.toThrow("row-level security");
    });
    it("allows managers to read submitted audits and own drafts without accessing others' drafts or writes", async () => {
      await login(3);
      expect((await db.query("select id from audits")).rows).toEqual(
        expect.arrayContaining([{ id: id(10) }, { id: id(11) }, { id: id(12) }]),
      );
      await db.exec("RESET ROLE");
      await db.query(
        "insert into audits(id,created_by,auditor_id,status) values($1,$2,$2,'draft'),($3,$4,$4,'draft')",
        [id(30), id(4), id(31), id(3)],
      );
      await db.query("insert into audit_answers(id,audit_id) values($1,$2)", [id(32), id(30)]);
      await login(3);
      expect((await db.query("select id from audits where status='draft'")).rows).toEqual([
        { id: id(31) },
      ]);
      expect((await db.query("select id from audit_answers where id=$1", [id(32)])).rows).toEqual(
        [],
      );
      expect(
        (await db.query("update audits set status='submitted' where id=$1 returning id", [id(31)]))
          .rows,
      ).toEqual([{ id: id(31) }]);
      expect((await db.query("select id from monthly_branch_tracking")).rows).toHaveLength(1);
      expect(
        (
          await db.query("update audits set created_by=$1 where id=$2 returning id", [
            id(3),
            id(10),
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (await db.query("update monthly_branch_tracking set fs_status='completed' returning id"))
          .rows,
      ).toEqual([]);
      await expect(db.query("select public.delete_user_completely($1)", [id(5)])).rejects.toThrow(
        "administrator",
      );
    });
    it("permits active-admin management while preventing self-demotion and self-deletion", async () => {
      await login(1);
      expect(
        (await db.query("update monthly_branch_tracking set fs_status='completed' returning id"))
          .rows,
      ).toHaveLength(1);
      await db.query("update user_roles set role='manager' where user_id=$1", [id(5)]);
      await expect(
        db.query("update user_roles set role='auditor' where user_id=$1", [id(1)]),
      ).rejects.toThrow("row-level security");
      await expect(db.query("select public.delete_user_completely($1)", [id(1)])).rejects.toThrow(
        "administrator",
      );
      await db.query("select public.delete_user_completely($1)", [id(2)]);
      expect((await db.query("select id from profiles where id=$1", [id(2)])).rows).toEqual([]);
    });
    it("blocks disabled accounts and keeps the proposal re-runnable without data changes", async () => {
      await login(6);
      expect((await db.query("select id from audits")).rows).toEqual([]);
      await expect(db.query("select public.delete_user_completely($1)", [id(5)])).rejects.toThrow(
        "administrator",
      );
      await db.exec("RESET ROLE");
      const before = (await db.query("select id from audits order by id")).rows;
      await db.exec(proposal);
      expect((await db.query("select id from audits order by id")).rows).toEqual(before);
    });
    it("rolls back instead of replacing an unreviewed live policy", async () => {
      await db.exec(
        "RESET ROLE; CREATE POLICY external_integration ON public.branches FOR SELECT TO authenticated USING(true)",
      );
      await expect(db.exec(proposal)).rejects.toThrow("Unreviewed existing policy");
      await db.exec("ROLLBACK");
      expect(
        (
          await db.query(
            "select policyname from pg_policies where schemaname='public' and tablename='branches' and policyname='external_integration'",
          )
        ).rows,
      ).toHaveLength(1);
      await db.exec("DROP POLICY external_integration ON public.branches");
    });
  },
);

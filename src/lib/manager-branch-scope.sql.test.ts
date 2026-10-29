import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("review-only manager branch scope", () => {
  it("filters dashboard payloads in SQL for only the restricted manager; preserves sharing and admin access", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const a = "2735c9c6-07a2-4218-981f-a0467cf28e5b",
      b = "5f508e7b-e372-4951-a191-7db1f219def7";
    try {
      await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,active boolean);CREATE TABLE user_roles(user_id uuid,role text);
   INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}'),('${a}'),('${b}');
   INSERT INTO profiles VALUES('${id(1)}','Admin',true),('${id(2)}','Manager 1',true),('${id(3)}','Manager 2',true),('${a}','م عبدالرحمن جمال',true),('${b}','إسلام توفيق',true);
   INSERT INTO user_roles VALUES('${id(1)}','admin'),('${id(2)}','manager'),('${id(3)}','manager'),('${a}','auditor'),('${b}','auditor');
   CREATE TABLE branches(id uuid PRIMARY KEY,name_ar text,code text,active boolean);
   INSERT INTO branches VALUES('${id(10)}','فرع أ','A',true),('${id(11)}','فرع ب','B',true);
   CREATE TABLE audit_types(id uuid PRIMARY KEY,code text,name_ar text,name_en text);
   INSERT INTO audit_types VALUES('${id(20)}','FS','FS','Food Safety');
   CREATE TABLE audits(id uuid PRIMARY KEY,audit_date date,status text,branch_id uuid,audit_type_id uuid);
   INSERT INTO audits VALUES('${id(30)}','2026-10-01','submitted','${id(10)}','${id(20)}'),('${id(31)}','2026-10-01','submitted','${id(11)}','${id(20)}'),('${id(32)}','2026-10-01','draft','${id(10)}','${id(20)}');
   CREATE TABLE sections(id uuid PRIMARY KEY,audit_type_id uuid,name_ar text,name_en text,is_delivery boolean,active boolean);
   CREATE TABLE questions(id uuid PRIMARY KEY,section_id uuid,audit_type_id uuid,max_score integer,text_ar text,active boolean);
   CREATE TABLE audit_answers(id uuid PRIMARY KEY,audit_id uuid,question_id uuid,score integer,is_na boolean);
   CREATE TABLE audit_section_status(audit_id uuid,section_id uuid,is_na boolean);
   CREATE TABLE audit_section_deductions(audit_id uuid,section_id uuid,percentage numeric);
   CREATE TABLE audit_general_deductions(audit_id uuid,percentage numeric);
   INSERT INTO sections VALUES('${id(40)}','${id(20)}','Section',null,false,true);
   INSERT INTO questions VALUES('${id(50)}','${id(40)}','${id(20)}',4,'Question',true),('${id(51)}','${id(40)}','${id(20)}',4,'NA',true);
   INSERT INTO audit_answers VALUES('${id(60)}','${id(30)}','${id(50)}',2,false),('${id(61)}','${id(30)}','${id(51)}',null,true);
   GRANT USAGE ON SCHEMA auth TO authenticated;`);
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-29_audit_sharing_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        (await readFile(
          new URL("../../docs/snapshot-live-before-manager-scope.sql", import.meta.url),
          "utf8",
        )) + ";",
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      const before = (
        await db.query(
          "select sqop_dashboard_snapshot('branches','2026-10-01','2026-10-31',null) as data",
        )
      ).rows[0].data;
      expect(before.audits.find((audit: any) => audit.id === id(30)).sections[0]).toMatchObject({
        maximum: 4,
        earned: 2,
      });
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-29_manager_branch_scope_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const login = async (user: string) =>
        db.exec(`RESET ROLE;SET ROLE authenticated;SET test.uid='${user}'`);
      const context = async () =>
        (await db.query("select sqop_audit_sharing_context() as ctx")).rows[0].ctx;
      const snapshot = async () =>
        (
          await db.query(
            "select sqop_dashboard_snapshot('branches','2026-10-01','2026-10-31',null) as data",
          )
        ).rows[0].data;
      await login(id(1));
      expect(await snapshot()).toEqual(before);
      await login(id(2));
      expect((await context()).visible_branch_ids).toBeNull();
      expect((await snapshot()).audits).toHaveLength(2);
      await login(id(1));
      await db.query(`select sqop_set_manager_branch_scope('${id(2)}',ARRAY['${id(10)}']::uuid[])`);
      await login(id(2));
      expect((await context()).visible_branch_ids).toEqual([id(10)]);
      const restricted = await snapshot();
      expect(restricted.locations.map((branch: any) => branch.id)).toEqual([id(10)]);
      expect(restricted.audits.map((audit: any) => audit.id)).toEqual([id(30)]);
      await expect(
        db.query(`select sqop_set_manager_branch_scope('${id(2)}',null)`),
      ).rejects.toThrow("Admin required");
      await login(id(3));
      expect((await snapshot()).audits).toHaveLength(2);
      await login(a);
      expect((await context()).peers).toEqual([b]);
      await login(id(1));
      expect((await snapshot()).audits).toHaveLength(3);
      await expect(
        db.query(`select sqop_set_manager_branch_scope('${id(2)}',ARRAY['${id(99)}']::uuid[])`),
      ).rejects.toThrow("Unknown branch");
      await db.query(`select sqop_set_manager_branch_scope('${id(2)}',ARRAY[]::uuid[])`);
      await login(id(2));
      expect((await snapshot()).audits).toEqual([]);
      expect((await context()).visible_branch_ids).toEqual([]);
      await login(id(1));
      await db.query(`select sqop_set_manager_branch_scope('${id(2)}',null)`);
      await login(id(2));
      expect((await snapshot()).audits).toHaveLength(2);
    } finally {
      await db.close();
    }
  });
});

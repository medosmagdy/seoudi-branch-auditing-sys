import { readFile } from "node:fs/promises";
import { it, expect, describe } from "vitest";
const mod = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!mod)("audit email access controls", () => {
  it("allows selected roles or specific users, while keeping original audit access and admin-only settings", async () => {
    const { PGlite } = await import(/* @vite-ignore */ mod!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(
        `CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY,active boolean);CREATE TABLE public.user_roles(user_id uuid,role text);CREATE TABLE public.branches(id uuid PRIMARY KEY,name_ar text);CREATE TABLE public.audit_types(id uuid PRIMARY KEY,code text,name_ar text,name_en text);CREATE TABLE public.audits(id uuid PRIMARY KEY,branch_id uuid,audit_type_id uuid,status text,created_by uuid,auditor_id uuid);CREATE TABLE public.user_section_access(user_id uuid,section_key text,visible boolean);CREATE FUNCTION public.sqop_share_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON p.id=r.user_id WHERE p.id=auth.uid() AND p.active AND r.role='admin')$$;CREATE FUNCTION public.sqop_audit_sharing_context() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"peers":[]}'::jsonb$$;CREATE FUNCTION public.sqop_manager_can_read_branch(x uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');INSERT INTO profiles VALUES('${id(1)}',true),('${id(2)}',true),('${id(3)}',true),('${id(4)}',false);INSERT INTO user_roles VALUES('${id(1)}','admin'),('${id(2)}','manager'),('${id(3)}','auditor'),('${id(4)}','auditor');INSERT INTO branches VALUES('${id(10)}','Branch');INSERT INTO audit_types VALUES('${id(20)}','FS','FS','FS');INSERT INTO audits VALUES('${id(30)}','${id(10)}','${id(20)}','submitted','${id(3)}','${id(3)}'),('${id(31)}','${id(10)}','${id(20)}','draft','${id(3)}','${id(3)}');`,
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-30_branch_email_recipients_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-30_audit_email_access_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(`SET test.uid='${id(3)}'`);
      expect(
        (await db.query("select sqop_audit_email_access_context() data")).rows[0].data,
      ).toMatchObject({ allowed: true, roles: null, user_ids: null });
      await expect(
        db.query("select sqop_audit_email_recipients($1)", [id(30)]),
      ).resolves.toBeDefined();
      await expect(
        db.query("select sqop_set_audit_email_access($1,$2)", [["auditor"], []]),
      ).rejects.toThrow("Admin required");
      await db.exec(`SET test.uid='${id(1)}'`);
      await db.query("select sqop_set_audit_email_access($1,$2)", [["manager"], [id(3)]]);
      await db.exec(`SET test.uid='${id(2)}'`);
      expect(
        (await db.query("select sqop_audit_email_access_context() data")).rows[0].data.allowed,
      ).toBe(true);
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(30)])).rejects.toThrow(
        "denied",
      );
      await db.exec(`SET test.uid='${id(3)}'`);
      expect(
        (await db.query("select sqop_audit_email_access_context() data")).rows[0].data.allowed,
      ).toBe(true);
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(31)])).rejects.toThrow(
        "Submitted",
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      await db.query("select sqop_set_audit_email_access($1,$2)", [["manager"], []]);
      expect(
        (await db.query("select sqop_audit_email_access_context() data")).rows[0].data.allowed,
      ).toBe(false);
      await db.exec(`SET test.uid='${id(3)}'`);
      expect(
        (await db.query("select sqop_audit_email_access_context() data")).rows[0].data.allowed,
      ).toBe(false);
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(30)])).rejects.toThrow(
        "preparation access denied",
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      await expect(
        db.query("select sqop_set_audit_email_access($1,$2)", [["manager"], [id(4)]]),
      ).rejects.toThrow("Invalid");
      const acl = (
        await db.query(
          `select has_table_privilege('authenticated','public.audit_email_access_settings','select') direct,has_function_privilege('anon','public.sqop_audit_email_access_context()','execute') anonymous`,
        )
      ).rows[0];
      expect(acl).toEqual({ direct: false, anonymous: false });
    } finally {
      await db.close();
    }
  }, 30000);
});

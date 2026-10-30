import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("private audit email recipients SQL", () => {
  it("keeps the directory admin-only, saves atomically and binds reads to allowed submitted audits", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE profiles(id uuid PRIMARY KEY,active boolean);CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE branches(id uuid PRIMARY KEY,name_ar text);CREATE TABLE audit_types(id uuid PRIMARY KEY,code text,name_ar text,name_en text);
    CREATE TABLE audits(id uuid PRIMARY KEY,branch_id uuid,audit_type_id uuid,status text,created_by uuid,auditor_id uuid);
    CREATE TABLE user_section_access(user_id uuid,section_key text,visible boolean);
    CREATE FUNCTION sqop_share_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=auth.uid() AND p.active AND r.role='admin')$$;
    CREATE FUNCTION sqop_audit_sharing_context() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('peers',CASE WHEN auth.uid()='${id(4)}' THEN jsonb_build_array('${id(2)}') ELSE '[]'::jsonb END)$$;
    CREATE FUNCTION sqop_manager_can_read_branch(branch uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT branch='${id(10)}'$$;
    INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');INSERT INTO profiles VALUES('${id(1)}',true),('${id(2)}',true),('${id(3)}',true),('${id(4)}',true);INSERT INTO user_roles VALUES('${id(1)}','admin'),('${id(2)}','auditor'),('${id(3)}','manager'),('${id(4)}','auditor');
    INSERT INTO branches VALUES('${id(10)}','Branch A'),('${id(11)}','Branch B');INSERT INTO audit_types VALUES('${id(20)}','FSMS','FSMS','FSMS'),('${id(21)}','MAINT','الصيانة','Maintenance');
    INSERT INTO audits VALUES('${id(30)}','${id(10)}','${id(20)}','submitted','${id(2)}','${id(2)}'),('${id(31)}','${id(11)}','${id(20)}','submitted',null,null),('${id(32)}','${id(10)}','${id(20)}','draft','${id(2)}','${id(2)}'),('${id(33)}','${id(10)}','${id(21)}','submitted','${id(2)}','${id(2)}');`);
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-30_branch_email_recipients_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      const row = {
        branch_id: id(10),
        to_addresses: ["manager@example.com", "MANAGER@example.com"],
        cc_addresses: ["manager@example.com", "quality@example.com"],
      };
      await db.query("select sqop_save_branch_email_recipients($1)", [JSON.stringify([row])]);
      const directory = (await db.query("select sqop_branch_email_directory() as data")).rows[0]
        .data;
      expect(directory[0]).toMatchObject({
        to_addresses: ["manager@example.com"],
        cc_addresses: ["quality@example.com"],
        configured: true,
      });
      await expect(
        db.query("select sqop_save_branch_email_recipients($1)", [
          JSON.stringify([
            { ...row, to_addresses: ["changed@example.com"] },
            { ...row, branch_id: id(11), cc_addresses: ["invalid"] },
          ]),
        ]),
      ).rejects.toThrow("Invalid email");
      expect(
        (await db.query("select to_addresses from branch_email_recipients")).rows[0].to_addresses,
      ).toEqual(["manager@example.com"]);
      await db.exec(`SET test.uid='${id(2)}'`);
      expect(
        (await db.query("select sqop_audit_email_recipients($1) as data", [id(30)])).rows[0].data
          .to_addresses,
      ).toEqual(["manager@example.com"]);
      await expect(db.query("select sqop_branch_email_directory()")).rejects.toThrow(
        "Admin required",
      );
      await expect(
        db.query("select sqop_save_branch_email_recipients($1)", [JSON.stringify([row])]),
      ).rejects.toThrow("Admin required");
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(31)])).rejects.toThrow(
        "denied",
      );
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(32)])).rejects.toThrow(
        "Submitted",
      );
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(33)])).rejects.toThrow(
        "Maintenance",
      );
      await db.exec(`SET test.uid='${id(3)}'`);
      await expect(
        db.query("select sqop_audit_email_recipients($1)", [id(30)]),
      ).resolves.toBeDefined();
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(31)])).rejects.toThrow(
        "denied",
      );
      await db.exec(`SET test.uid='${id(4)}'`);
      await expect(
        db.query("select sqop_audit_email_recipients($1)", [id(30)]),
      ).resolves.toBeDefined();
      await db.exec(`INSERT INTO user_section_access VALUES('${id(4)}','audits',false)`);
      await expect(db.query("select sqop_audit_email_recipients($1)", [id(30)])).rejects.toThrow(
        "denied",
      );
      expect(
        (
          await db.query(
            "select has_table_privilege('authenticated','branch_email_recipients','select') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
      expect(
        (
          await db.query(
            "select has_function_privilege('anon','sqop_branch_email_directory()','execute') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    } finally {
      await db.close();
    }
  });
});

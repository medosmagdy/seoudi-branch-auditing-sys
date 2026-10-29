import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("review-only audit sharing SQL", () => {
  it("limits initial peers to the exact pair, secures membership, updates atomically and revokes without transitive access", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const admin = "00000000-0000-4000-8000-000000000001",
      a = "2735c9c6-07a2-4218-981f-a0467cf28e5b",
      b = "5f508e7b-e372-4951-a191-7db1f219def7",
      c = "00000000-0000-4000-8000-000000000003",
      inactive = "00000000-0000-4000-8000-000000000004",
      group = "36ab7dc8-7f35-4d0b-969d-6d7fdcc01721";
    try {
      await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,active boolean);CREATE TABLE user_roles(user_id uuid,role text);
    INSERT INTO auth.users VALUES('${admin}'),('${a}'),('${b}'),('${c}'),('${inactive}');
    INSERT INTO profiles VALUES('${admin}','Admin',true),('${a}','م عبدالرحمن جمال',true),('${b}','إسلام توفيق',true),('${c}','Unrelated',true),('${inactive}','Inactive',false);
    INSERT INTO user_roles VALUES('${admin}','admin'),('${a}','auditor'),('${b}','auditor'),('${c}','auditor');
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
      const context = async () =>
        (await db.query("select sqop_audit_sharing_context() as ctx")).rows[0].ctx;
      const login = async (id: string) =>
        db.exec(`RESET ROLE;SET ROLE authenticated;SET test.uid='${id}'`);
      await login(a);
      expect((await context()).peers).toEqual([b]);
      expect((await context()).groups).toEqual([]);
      await expect(db.query("select * from audit_share_members")).rejects.toThrow();
      await expect(
        db.query(
          `select sqop_set_audit_share_group(null,'forbidden',ARRAY['${a}','${c}']::uuid[])`,
        ),
      ).rejects.toThrow("Admin required");
      await login(c);
      expect((await context()).peers).toEqual([]);
      await login(admin);
      expect((await context()).groups[0].member_ids.sort()).toEqual([a, b].sort());
      await db.query(
        `select sqop_set_audit_share_group(null,'B and C',ARRAY['${b}','${c}']::uuid[])`,
      );
      await login(a);
      expect((await context()).peers).toEqual([b]); // no A -> B -> C transitive grant
      await login(admin);
      await expect(
        db.query(
          `select sqop_set_audit_share_group('${group}','bad',ARRAY['${a}','${inactive}']::uuid[])`,
        ),
      ).rejects.toThrow("active");
      expect((await context()).groups.find((g: any) => g.id === group).member_ids.sort()).toEqual(
        [a, b].sort(),
      );
      await db.query(
        `select sqop_set_audit_share_group('${group}','Changed',ARRAY['${a}','${c}']::uuid[])`,
      );
      await login(a);
      expect((await context()).peers).toEqual([c]);
      await login(admin);
      await db.query(`select sqop_delete_audit_share_group('${group}')`);
      await login(a);
      expect((await context()).peers).toEqual([]);
      await db.exec("RESET ROLE;SET ROLE anon");
      await expect(context()).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});

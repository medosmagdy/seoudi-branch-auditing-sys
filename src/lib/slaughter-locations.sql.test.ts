import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("optional location registry migration", () => {
  it("creates an admin-only registry and leaves an existing table untouched on rerun", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid',true)::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE profiles(id uuid PRIMARY KEY,active boolean);CREATE TABLE user_roles(user_id uuid,role text);
   INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
   INSERT INTO profiles VALUES ('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',true);
   INSERT INTO user_roles VALUES ('00000000-0000-4000-8000-000000000001','admin'),('00000000-0000-4000-8000-000000000002','auditor');
   GRANT USAGE ON SCHEMA auth TO authenticated;GRANT SELECT ON profiles,user_roles TO authenticated;`);
      const sql = await readFile(
        new URL(
          "../../supabase/migrations/20261024130000_optional_slaughter_locations.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(sql);
      await db.exec(sql);
      await db.exec(
        `SET ROLE authenticated;SET test.uid='00000000-0000-4000-8000-000000000001';INSERT INTO slaughter_locations(kind,name,created_by) VALUES ('farm','Saved','00000000-0000-4000-8000-000000000001');`,
      );
      expect((await db.query("SELECT name FROM slaughter_locations")).rows).toEqual([
        { name: "Saved" },
      ]);
      await db.exec(`SET test.uid='00000000-0000-4000-8000-000000000002';`);
      expect((await db.query("SELECT name FROM slaughter_locations")).rows).toEqual([]);
      await expect(
        db.exec(
          `INSERT INTO slaughter_locations(kind,name,created_by) VALUES ('farm','denied','00000000-0000-4000-8000-000000000002')`,
        ),
      ).rejects.toThrow();
      await db.exec("RESET ROLE");
      const before = await db.query(
        "SELECT policyname FROM pg_policies WHERE tablename='slaughter_locations' ORDER BY policyname",
      );
      await db.exec(sql);
      expect((await db.query("SELECT name FROM slaughter_locations")).rows).toEqual([
        { name: "Saved" },
      ]);
      expect(
        (
          await db.query(
            "SELECT policyname FROM pg_policies WHERE tablename='slaughter_locations' ORDER BY policyname",
          )
        ).rows,
      ).toEqual(before.rows);
    } finally {
      await db.close();
    }
  });
  it("does not change schema or enable policies on a pre-existing registry", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE TABLE slaughter_locations(kind text,name text);INSERT INTO slaughter_locations VALUES ('farm','Existing');",
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/migrations/20261024130000_optional_slaughter_locations.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      expect((await db.query("SELECT * FROM slaughter_locations")).rows).toEqual([
        { kind: "farm", name: "Existing" },
      ]);
      expect(
        (
          await db.query(
            "SELECT relrowsecurity FROM pg_class WHERE oid='slaughter_locations'::regclass",
          )
        ).rows[0].relrowsecurity,
      ).toBe(false);
    } finally {
      await db.close();
    }
  });
});

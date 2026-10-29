import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("section access database authorization", () => {
  it("restricts writes, hides other users settings and preserves atomic validation", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,active boolean); CREATE TABLE user_roles(user_id uuid,role text);
    INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}'); INSERT INTO profiles VALUES('${id(1)}',true),('${id(2)}',true),('${id(3)}',false); INSERT INTO user_roles VALUES('${id(1)}','admin'),('${id(2)}','manager'),('${id(3)}','auditor');
    CREATE FUNCTION sqop_share_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=auth.uid() AND p.active AND r.role='admin') $$;`);
      await db.exec(`CREATE SCHEMA storage;
       CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
       CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text);
       CREATE TABLE public.slaughter_reports(id uuid PRIMARY KEY,created_by uuid);
       CREATE TABLE public.slaughter_report_photos(id uuid PRIMARY KEY,report_id uuid REFERENCES public.slaughter_reports ON DELETE CASCADE);
       CREATE TABLE public.slaughter_locations(id uuid PRIMARY KEY,name text);
       ALTER TABLE public.slaughter_reports ENABLE ROW LEVEL SECURITY;
       ALTER TABLE public.slaughter_report_photos ENABLE ROW LEVEL SECURITY;
       ALTER TABLE public.slaughter_locations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
       GRANT USAGE ON SCHEMA public,auth,storage TO authenticated;
       GRANT ALL ON storage.objects TO authenticated;`);
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-29_section_visibility_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      await db.query("select sqop_set_section_access($1,$2)", [
        id(2),
        JSON.stringify({ slaughtering: true, expiry: false, future_section: false }),
      ]);
      const rows = await db.query("select sqop_section_access_context() as data");
      expect(rows.rows[0].data.users).toHaveLength(1);
      await expect(
        db.query("select sqop_set_section_access($1,$2)", [id(2), ' {"expiry":"false"}']),
      ).rejects.toThrow("Invalid section");
      await expect(
        db.query("select sqop_set_section_access($1,$2)", [id(1), "{}"]),
      ).rejects.toThrow("Administrator");
      await expect(
        db.query("select sqop_set_section_access($1,$2)", [id(3), "{}"]),
      ).rejects.toThrow("Active user");
      await db.exec(`SET test.uid='${id(2)}'`);
      const own = (await db.query("select sqop_section_access_context() as data")).rows[0].data;
      await db.exec("SET ROLE authenticated");
      await db.query("insert into slaughter_reports values($1,$2)", [id(10), id(1)]);
      await db.query("insert into storage.objects values($1,$2,$3)", [
        id(11),
        "audit-reports",
        `slaughter/${id(10)}/photo.jpg`,
      ]);
      expect((await db.query("select * from slaughter_reports")).rows).toHaveLength(1);
      await db.query("delete from slaughter_reports where id=$1", [id(10)]);
      expect((await db.query("select * from slaughter_reports")).rows).toHaveLength(0);
      await expect(
        db.query("insert into storage.objects values($1,$2,$3)", [
          id(12),
          "audit-reports",
          "other/path",
        ]),
      ).rejects.toThrow();
      await db.exec("RESET ROLE");
      expect(own).toEqual({
        overrides: { slaughtering: true, expiry: false, future_section: false },
        users: [],
      });
      await expect(
        db.query("select sqop_set_section_access($1,$2)", [id(2), "{}"]),
      ).rejects.toThrow("Admin required");
      await db.exec(`SET test.uid='${id(3)}'`);
      await expect(db.query("select sqop_section_access_context()")).rejects.toThrow(
        "Active account",
      );
      await db.exec(`SET test.uid='${id(1)}'`);
      await db.query("select sqop_set_section_access($1,$2)", [id(2), "{}"]);
      expect((await db.query("select count(*)::int as n from user_section_access")).rows[0].n).toBe(
        0,
      );
      await db.exec(`SET test.uid='${id(2)}'; SET ROLE authenticated`);
      expect((await db.query("select * from slaughter_reports")).rows).toHaveLength(0);
      await expect(
        db.query("insert into slaughter_reports values($1,$2)", [id(20), id(2)]),
      ).rejects.toThrow();
      await db.exec("RESET ROLE");
      expect(
        (
          await db.query(
            "select has_function_privilege('anon','sqop_set_section_access(uuid,jsonb)','execute') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
      expect(
        (
          await db.query(
            "select has_table_privilege('authenticated','user_section_access','select') as allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    } finally {
      await db.close();
    }
  });
});

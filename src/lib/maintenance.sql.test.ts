import { readFile } from "node:fs/promises";
import { it, expect, describe } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("maintenance SQL lifecycle and authorization", () => {
  it("isolates history, latest submitted snapshots, duplication and concurrent edits", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(
        `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY,active boolean);CREATE TABLE public.user_section_access(user_id uuid,section_key text,visible boolean);CREATE TABLE branches(id uuid PRIMARY KEY,name_ar text,name_en text);CREATE FUNCTION sqop_share_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT auth.uid()='${id(1)}'$$;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}');INSERT INTO profiles VALUES('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);INSERT INTO branches VALUES('${id(10)}','شيراتون','Sheraton'),('${id(11)}','روكسي','Roxy');`,
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-30_maintenance_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-31_maintenance_report_managers_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await expect(db.query("select sqop_maintenance_index()")).rejects.toThrow("denied");
      await db.exec(`SET test.uid='${id(1)}'`);
      async function create(date: string, source: string | null = null, branch = id(10)) {
        return (
          await db.query("select sqop_maintenance_create($1,$2,$3,$4) id", [
            branch,
            date,
            "مراجع",
            source,
          ])
        ).rows[0].id;
      }
      async function report(r: string) {
        return (await db.query("select sqop_maintenance_report($1) data", [r])).rows[0].data;
      }
      async function index() {
        return (await db.query("select sqop_maintenance_index() data")).rows[0].data;
      }
      async function save(r: unknown) {
        return db.query("select sqop_maintenance_save($1)", [JSON.stringify(r)]);
      }
      const first = await create("2026-06-01");
      let r = await report(first);
      const finding = {
        id: id(20),
        section: "سمك",
        description: "صيانة",
        initial_history: "9/2024",
        severity: "high",
        status: "open",
        corrective_action: "",
        evidence: "",
        comments: "",
        assigned_to: "",
        due_date: null,
        photos: [],
      };
      r = {
        ...r,
        status: "submitted",
        branch_manager: "مدير الفرع",
        maintenance_area_manager: "مدير الصيانة",
        findings: [finding],
      };
      await save(r);
      expect((await index()).findings).toHaveLength(1);
      await expect(save(r)).rejects.toThrow("مستخدم آخر");
      const copy = await create("2026-09-01", first);
      let c = await report(copy);
      expect(c.status).toBe("draft");
      expect(c.branch_manager).toBe("مدير الفرع");
      expect(c.maintenance_area_manager).toBe("مدير الصيانة");
      const oldClient = { ...c };
      delete oldClient.branch_manager;
      delete oldClient.maintenance_area_manager;
      await save(oldClient);
      c = await report(copy);
      expect(c.branch_manager).toBe("مدير الفرع");
      await expect(save({ ...c, branch_manager: null })).rejects.toThrow("Invalid manager");
      expect(c.findings[0].id).not.toBe(finding.id);
      expect(c.findings[0].description).toBe("صيانة");
      expect((await index()).findings[0].report_id).toBe(first);
      c.findings[0].status = "resolved";
      await save({ ...c, status: "submitted" });
      expect((await index()).findings).toHaveLength(1);
      expect((await index()).findings[0].status).toBe("resolved");
      expect((await report(first)).findings[0].status).toBe("open");
      const older = await create("2026-01-01", first);
      await save({ ...(await report(older)), status: "submitted" });
      expect((await index()).findings[0].report_id).toBe(copy);
      await expect(create("2026-12-01", first, id(11))).rejects.toThrow("mismatch");
      c = await report(copy);
      await expect(
        save({ ...c, findings: [{ ...c.findings[0], severity: "INVALID" }] }),
      ).rejects.toThrow("Invalid");
      expect((await report(copy)).findings).toHaveLength(1);
      await expect(
        save({
          ...c,
          findings: [{ ...c.findings[0], photos: [`maintenance/${copy}/${id(30)}.jpg`] }],
        }),
      ).rejects.toThrow("photo");
      await db.exec(
        `INSERT INTO maintenance_photos(path,report_id,registered) VALUES('maintenance/${copy}/${id(30)}.jpg','${copy}',true)`,
      );
      await save({
        ...c,
        findings: [{ ...c.findings[0], photos: [`maintenance/${copy}/${id(30)}.jpg`] }],
      });
      const photoCopy = await create("2026-12-01", copy);
      expect((await report(photoCopy)).findings[0].photos).toHaveLength(1);
      await db.exec(`SET test.uid='${id(2)}'`);
      await expect(index()).rejects.toThrow("denied");
      await db.exec(`INSERT INTO user_section_access VALUES('${id(2)}','maintenance',true)`);
      expect((await index()).reports).toHaveLength(4);
      await db.exec(
        `SET test.uid='${id(3)}';INSERT INTO user_section_access VALUES('${id(3)}','maintenance',true)`,
      );
      await expect(index()).rejects.toThrow("denied");
      await db.exec(`SET test.uid='${id(1)}'`);
      const v = (await report(copy)).version;
      await db.query("select sqop_maintenance_delete($1,$2)", [copy, v]);
      expect((await index()).findings[0].report_id).toBe(first);
      expect((await report(photoCopy)).findings[0].photos).toHaveLength(1);
      const clean = await create("2027-03-01");
      await save({ ...(await report(clean)), status: "submitted" });
      expect((await index()).findings).toHaveLength(0);
      await db.query("select sqop_maintenance_delete($1,$2)", [clean, 2]);
      expect((await index()).findings[0].report_id).toBe(first);
      const current = await report(first);
      await expect(
        save({ ...current, findings: [{ ...current.findings[0], due_date: "infinity" }] }),
      ).rejects.toThrow("Invalid due date");
      const acl = (
        await db.query(
          `select has_table_privilege('authenticated','maintenance_reports','SELECT') direct,has_table_privilege('authenticated','maintenance_photos','INSERT') photo_insert,has_function_privilege('anon','sqop_maintenance_index()','EXECUTE') anonymous`,
        )
      ).rows[0];
      expect(acl).toEqual({ direct: false, photo_insert: false, anonymous: false });
    } finally {
      await db.close();
    }
  }, 30000);
});

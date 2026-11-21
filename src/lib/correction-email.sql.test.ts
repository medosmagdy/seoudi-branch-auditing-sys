import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];

describe.skipIf(!modulePath)("correction email setting on isolated PostgreSQL", () => {
  it("starts denied, leaves normal email settings intact and exposes no table permissions to clients", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
        CREATE TABLE public.audit_email_access_settings (roles text[] NOT NULL);
        INSERT INTO public.audit_email_access_settings VALUES (ARRAY['admin','auditor']);
      `);
      const proposal = await readFile(
        new URL(
          "../../supabase/proposals/2026-11-21_audit_correction_email_REVIEW_ONLY.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(proposal);
      const result = await db.query(`SELECT
        (SELECT roles FROM public.audit_correction_email_settings) AS correction,
        (SELECT roles FROM public.audit_email_access_settings) AS normal,
        has_table_privilege('anon','public.audit_correction_email_settings','select') AS anon_read,
        has_table_privilege('authenticated','public.audit_correction_email_settings','update') AS user_write,
        has_table_privilege('service_role','public.audit_correction_email_settings','update') AS server_write
      `);
      expect(result.rows).toEqual([
        {
          correction: [],
          normal: ["admin", "auditor"],
          anon_read: false,
          user_write: false,
          server_write: true,
        },
      ]);
      await db.exec(
        "SET ROLE service_role; UPDATE public.audit_correction_email_settings SET roles=ARRAY['manager'] WHERE id=true; RESET ROLE;",
      );
      await db.exec(proposal);
      expect(
        (await db.query("SELECT roles FROM public.audit_correction_email_settings")).rows,
      ).toEqual([{ roles: ["manager"] }]);
    } finally {
      await db.close();
    }
  }, 15000);
});

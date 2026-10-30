import { readFile } from "node:fs/promises";
import { it, expect, describe } from "vitest";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("submission completeness database guard", () => {
  it("blocks missing/null/out-of-range grades but preserves zero, N/A, inactive questions and historical submissions", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    try {
      await db.exec(
        `CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE audits(id uuid PRIMARY KEY,audit_type_id uuid,status text);CREATE TABLE sections(id uuid PRIMARY KEY,audit_type_id uuid,active boolean);CREATE TABLE questions(id uuid PRIMARY KEY,section_id uuid,audit_type_id uuid,active boolean,item_id text,max_score numeric);CREATE TABLE audit_answers(audit_id uuid,question_id uuid,score numeric,is_na boolean);CREATE TABLE audit_section_status(audit_id uuid,section_id uuid,is_na boolean);INSERT INTO sections VALUES('${id(1)}','${id(10)}',true),('${id(2)}','${id(10)}',false);INSERT INTO questions VALUES('${id(3)}','${id(1)}','${id(10)}',true,'FS-1',4),('${id(4)}','${id(1)}','${id(10)}',true,'FS-2',2),('${id(5)}','${id(1)}','${id(10)}',false,'old',4),('${id(6)}','${id(2)}','${id(10)}',true,'inactive-section',4);INSERT INTO audits VALUES('${id(20)}','${id(10)}','draft'),('${id(21)}','${id(10)}','submitted');`,
      );
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-10-30_submission_completeness_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const submit = () => db.query(`update audits set status='submitted' where id=$1`, [id(20)]);
      await expect(submit()).rejects.toThrow("بدون تقييم");
      await db.exec(
        `INSERT INTO audit_answers VALUES('${id(20)}','${id(3)}',0,false),('${id(20)}','${id(4)}',null,false)`,
      );
      await expect(submit()).rejects.toThrow("بدون تقييم");
      await db.exec(`UPDATE audit_answers SET score=3 WHERE question_id='${id(4)}'`);
      await expect(submit()).rejects.toThrow("بدون تقييم");
      await db.exec(`UPDATE audit_answers SET score=null,is_na=true WHERE question_id='${id(4)}'`);
      await expect(submit()).resolves.toBeDefined();
      await db.exec(
        `UPDATE audits SET status='draft' WHERE id='${id(20)}';DELETE FROM audit_answers;INSERT INTO audit_section_status VALUES('${id(20)}','${id(1)}',true)`,
      );
      await expect(submit()).resolves.toBeDefined();
      await expect(
        db.exec(`UPDATE audits SET status='submitted' WHERE id='${id(21)}'`),
      ).resolves.toBeDefined();
      await expect(
        db.exec(`INSERT INTO audits VALUES('${id(22)}','${id(10)}','submitted')`),
      ).rejects.toThrow("بدون تقييم");
    } finally {
      await db.close();
    }
  }, 30000);
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { computeAudit, type ScoringSection } from "./scoring";

const modulePath = process.env["SQOP_PGLITE_MODULE"];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const usual = "فرع عادي";
const dark = "دارك ستور المعادي";
const def = (id: string, score: number) => ({ id, maxScore: score });

describe.skipIf(!modulePath)("approved audit score synchronization", () => {
  it("updates only the approved grade, using the report's scoring and valid edits", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE TABLE branches(id uuid PRIMARY KEY,name_ar text);
        CREATE TABLE audits(id uuid PRIMARY KEY,branch_id uuid REFERENCES branches(id),audit_type_id uuid,status text,
          version integer,submitted_at timestamptz,score numeric(9,2),overall_score numeric(9,2));
        CREATE TABLE sections(id uuid PRIMARY KEY,audit_type_id uuid,active boolean,is_delivery boolean,order_index int);
        CREATE TABLE questions(id uuid PRIMARY KEY,section_id uuid,audit_type_id uuid,active boolean,max_score int);
        CREATE TABLE audit_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid REFERENCES audits(id),
          question_id uuid,score numeric,is_na boolean,comment text,UNIQUE(audit_id,question_id));
        CREATE TABLE audit_section_status(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid REFERENCES audits(id),
          section_id uuid,is_na boolean);
        CREATE TABLE audit_general_deductions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid REFERENCES audits(id),
          reason_text text,percentage numeric,created_at timestamptz DEFAULT now());
        CREATE TABLE audit_section_deductions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid REFERENCES audits(id),
          section_id uuid,reason_text text,percentage numeric,created_at timestamptz DEFAULT now());
        INSERT INTO branches VALUES ('${id(1)}','${usual}'),('${id(2)}','${dark}');
        INSERT INTO audits VALUES
          ('${id(11)}','${id(1)}','${id(3)}','submitted',2,'2026-11-01 00:00+00',91,91),
          ('${id(12)}','${id(2)}','${id(3)}','submitted',2,'2026-11-01 00:00+00',91,91),
          ('${id(13)}','${id(1)}','${id(3)}','draft',1,null,62,63);
        INSERT INTO sections VALUES
          ('${id(4)}','${id(3)}',true,false,1),('${id(5)}','${id(3)}',true,true,2),
          ('${id(6)}','${id(3)}',false,false,3);
        INSERT INTO questions VALUES
          ('${id(7)}','${id(4)}','${id(3)}',true,4),('${id(8)}','${id(4)}','${id(3)}',true,3),
          ('${id(9)}','${id(5)}','${id(3)}',true,4),('${id(10)}','${id(6)}','${id(3)}',true,4),
          ('${id(14)}','${id(4)}','${id(99)}',true,4);
        INSERT INTO audit_answers(audit_id,question_id,score,is_na)
          SELECT a.id,'${id(7)}',2,false FROM audits a;
        INSERT INTO audit_answers(audit_id,question_id,score,is_na)
          SELECT a.id,'${id(9)}',0,false FROM audits a;
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      `);
      await db.exec(
        await readFile(
          new URL(
            "../../supabase/proposals/2026-11-19_approved_audit_score_sync_REVIEW_ONLY.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec("SET ROLE authenticated");
      const read = async (audit: number) =>
        (
          await db.query(
            "select score::float8 score,overall_score::float8 overall,status,version,submitted_at from audits where id=$1",
            [id(audit)],
          )
        ).rows[0];
      const original = await read(11);
      expect(original).toMatchObject({ score: 91, overall: 91, status: "submitted", version: 2 });
      await db.exec(`
        UPDATE audit_answers SET comment='تصحيح ملاحظة' WHERE audit_id='${id(11)}';
        UPDATE audit_answers SET score=4 WHERE audit_id='${id(11)}' AND question_id='${id(9)}';
        INSERT INTO audit_answers(audit_id,question_id,score,is_na) VALUES
          ('${id(11)}','${id(8)}',3,false),('${id(11)}','${id(14)}',0,false);
      `);
      expect(await read(11)).toEqual(original);

      let first: { score: number | null; isNa: boolean } = { score: 0, isNa: false };
      let foodNA = false;
      let sectionDiscount: number[] = [];
      let general: number[] = [];
      const resultMatches = async (audit: number, branch: string, delivery = 4) => {
        const s: ScoringSection[] = [
          {
            id: "food",
            nameAr: "food",
            isNa: foodNA,
            questions: [def("first", 4), def("second", 3)],
            deductions: sectionDiscount.map((percentage) => ({ reasonText: "", percentage })),
          },
          {
            id: "delivery",
            nameAr: "delivery",
            isDelivery: true,
            questions: [def("d", 4)],
            deductions: [],
          },
        ];
        const wanted = computeAudit(
          s,
          { first, second: { score: 3, isNa: false }, d: { score: delivery, isNa: false } },
          general.map((percentage) => ({ percentage })),
          branch,
        );
        expect(await read(audit)).toMatchObject({
          score: wanted.finalPercentage,
          overall: wanted.overallPercentage,
          status: "submitted",
          version: 2,
          submitted_at: (original as { submitted_at: Date }).submitted_at,
        });
      };
      await db.exec(`UPDATE audit_answers SET score=0 WHERE question_id='${id(7)}'`);
      await resultMatches(11, usual);
      await resultMatches(12, dark, 0);
      expect(await read(13)).toMatchObject({ score: 62, overall: 63, status: "draft", version: 1 });

      sectionDiscount = [12.5];
      general = [5.25];
      await db.exec(`
        INSERT INTO audit_section_deductions(audit_id,section_id,percentage)
          VALUES ('${id(11)}','${id(4)}',12.5);
        INSERT INTO audit_general_deductions(audit_id,percentage) VALUES ('${id(11)}',5.25);
      `);
      await resultMatches(11, usual);
      general = [];
      await db.exec(`DELETE FROM audit_general_deductions WHERE audit_id='${id(11)}'`);
      await resultMatches(11, usual);

      const beforeIncomplete = await read(11);
      await db.exec(
        `UPDATE audit_answers SET score=null WHERE audit_id='${id(11)}' AND question_id='${id(7)}'`,
      );
      expect(await read(11)).toEqual(beforeIncomplete);
      first = { score: null, isNa: true };
      await db.exec(
        `UPDATE audit_answers SET is_na=true WHERE audit_id='${id(11)}' AND question_id='${id(7)}'`,
      );
      await resultMatches(11, usual);
      foodNA = true;
      await db.exec(
        `INSERT INTO audit_section_status(audit_id,section_id,is_na) VALUES ('${id(11)}','${id(4)}',true)`,
      );
      await resultMatches(11, usual);
      foodNA = false;
      await db.exec(`UPDATE audit_section_status SET is_na=false WHERE audit_id='${id(11)}'`);
      await resultMatches(11, usual);
    } finally {
      await db.close();
    }
  }, 30_000);
});

import { describe, it, expect } from "vitest";
import { emptySlaughterInput, evaluateSlaughter } from "./slaughter-evaluation";
const modulePath = process.env["SQOP_PGLITE_MODULE"];
describe.skipIf(!modulePath)("v2 slaughter details on isolated PostgreSQL", () => {
  it("stores nulls, direct zeros and pairs without changing a legacy row", async () => {
    const { PGlite } = await import(/* @vite-ignore */ modulePath!);
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE TABLE reports (id text PRIMARY KEY, meat_score numeric, report_details jsonb); INSERT INTO reports VALUES ('old',99,'{\"version\":1,\"score\":99}');",
      );
      const input = emptySlaughterInput();
      input.number = 2;
      input.received = 2;
      input.directDegrees = { Tools: "0" };
      input.cases = [
        {
          kind: "condemnation",
          item: "Kidney",
          quantity: 6,
          unit: "pair",
          affectedAnimals: 2,
          weight: null,
          reason: "test",
          category: "other",
        },
      ];
      const evaluation = evaluateSlaughter(input);
      const details = { version: 2, input, evaluation, score: evaluation.score };
      await db.query("INSERT INTO reports VALUES ($1,$2,$3::jsonb)", [
        "new",
        0,
        JSON.stringify(details),
      ]);
      const result = await db.query("SELECT report_details FROM reports WHERE id='new'");
      const row = result.rows[0].report_details;
      expect(row.score).toBeNull();
      expect(row.input.directDegrees.Tools).toBe("0");
      expect(row.input.cases[0].unit).toBe("pair");
      expect(row.input.cases[0].quantity).toBe(6);
      const old = await db.query("SELECT meat_score,report_details FROM reports WHERE id='old'");
      expect(old.rows[0].meat_score).toBe("99");
      expect(old.rows[0].report_details).toEqual({ version: 1, score: 99 });
    } finally {
      await db.close();
    }
  });
});

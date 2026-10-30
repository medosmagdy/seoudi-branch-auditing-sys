import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import {
  previewRecipientRows,
  recipientImportPayload,
  type BranchEmailTarget,
} from "./branch-email-recipients";
import { emailRecipients } from "./audit-email";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const branches = ["المعادي1", "معادي2", "سيتي", "حسنين", "ديستركت5", "سوديك إيست", "روكسي"].map(
  (name, i) => ({
    branch_id: id(i + 1),
    branch_name: name,
    to_addresses: [],
    cc_addresses: [],
    configured: false,
  }),
) satisfies BranchEmailTarget[];
describe("private recipient import", () => {
  it("handles Office display names, unique addresses and exact supplied branch aliases", () => {
    expect(
      emailRecipients('"Manager" <manager@example.com>; Quality Team <quality@example.com>'),
    ).toEqual(["manager@example.com", "quality@example.com"]);
    const names = [
      "المعادي 1",
      "المعادي 2",
      "سيتي ستارز",
      "حسنين هيكل",
      "ديستركت  5",
      "سوديك ايست",
      "روكسي ",
    ];
    const rows = previewRecipientRows(
      names.map((n) => [
        n,
        '"Manager" <manager@example.com>',
        "manager@example.com; quality@example.com",
      ]),
      branches,
    );
    expect(rows.map((r) => r.branchId)).toEqual(branches.map((b) => b.branch_id));
    const payload = recipientImportPayload(rows);
    expect(payload[0]).toEqual({
      branch_id: id(1),
      to_addresses: ["manager@example.com"],
      cc_addresses: ["quality@example.com"],
    });
  });
  it("skips blank rows and optional headers but never guesses unmatched or ambiguous branches", () => {
    const rows = previewRecipientRows(
      [
        ["اسم الفرع", "To", "CC"],
        ["روكسي", "manager@example.com", ""],
        [null, null, null],
        ["روكسي الجديدة", "other@example.com", ""],
      ],
      branches,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]!.branchId).toBe("");
    expect(() => recipientImportPayload(rows)).toThrow("حدد الفرع");
    const ambiguous = previewRecipientRows(
      [["روكسي", "manager@example.com", ""]],
      [...branches, { ...branches[6]!, branch_id: id(100) }],
    );
    expect(ambiguous[0]!.branchId).toBe("");
  });
  it("blocks invalid addresses, blank To and duplicate branch assignments before saving", () => {
    const rows = previewRecipientRows([["روكسي", "manager@example.com", ""]], branches);
    expect(() => recipientImportPayload([...rows, { ...rows[0]!, row: 2 }])).toThrow("مكرر");
    expect(() => recipientImportPayload([{ ...rows[0]!, to: "" }])).toThrow("To");
    expect(() =>
      recipientImportPayload([
        { ...rows[0]!, cc: "manager@example.com\r\nBcc: victim@example.com" },
      ]),
    ).toThrow();
    expect(() => emailRecipients('"Injected\rname" <manager@example.com>')).toThrow();
  });
});

it.skipIf(!process.env["SQOP_RECIPIENT_WORKBOOK"] || !process.env["SQOP_RECIPIENT_BRANCHES"])(
  "validates a privately supplied workbook without embedding contacts in source",
  async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await readFile(process.env["SQOP_RECIPIENT_WORKBOOK"]!), {
      type: "buffer",
    });
    const branches = JSON.parse(
      await readFile(process.env["SQOP_RECIPIENT_BRANCHES"]!, "utf8"),
    ) as BranchEmailTarget[];
    const rows = previewRecipientRows(
      XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]!]!, {
        header: 1,
        raw: false,
        defval: "",
      }),
      branches,
    );
    const payload = recipientImportPayload(rows);
    expect(payload.length).toBeGreaterThan(0);
    expect(new Set(payload.map((p) => p.branch_id)).size).toBe(payload.length);
    if (process.env["SQOP_RECIPIENT_IMPORT_PAYLOAD"])
      await writeFile(process.env["SQOP_RECIPIENT_IMPORT_PAYLOAD"]!, JSON.stringify(payload), {
        mode: 0o600,
      });
  },
);

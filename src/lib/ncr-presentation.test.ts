import { expect, it } from "vitest";
import { auditEmailDraft, auditEmailHtml } from "./audit-email";
import { summarizeNcr } from "./ncr-management";
import { ncrMailHtml, ncrMailTemplate, priorityEvidence } from "./ncr-presentation";

const branch = { id: "branch", name: "فرع النخيل", active: true };
const filters = {
  branchId: branch.id,
  start: "2026-11-01",
  end: "2026-11-30",
  program: "both",
} as const;
const audits = [
  { id: "one", date: "2026-11-20", program: "FS", score: 88 },
  { id: "two", date: "2026-11-13", program: "GHP", score: 92 },
] as const;
const finding = {
  auditId: "one",
  questionId: "date-tag",
  itemId: "FS-02",
  section: "المخبوزات",
  question: "بطاقات تعريف المنتج",
  observation: "عدم وجود تاريخ على العبوات",
  earned: 1,
  maximum: 4,
};

it("asks the branch to act on a real repeated finding and preserves the edited mail in both MIME formats", async () => {
  const summary = summarizeNcr(
    [...audits],
    [
      finding,
      {
        ...finding,
        auditId: "two",
        questionId: "date-g",
        observation: "تاريخ الإنتاج ممسوح",
        earned: 0,
      },
    ],
  );
  expect(priorityEvidence(summary.priorities[0]!)?.auditId).toBe("two");
  const draft = ncrMailTemplate(branch, filters, summary);
  expect(draft.body).toContain("الزملاء في فريق فرع النخيل،");
  expect(draft.body).not.toContain("فرع فرع");
  expect(draft.body).toContain("غياب أو عدم وضوح بيانات التاريخ");
  expect(draft.body).toContain("في أوديتين");
  expect(draft.body).toContain("المسؤول عن تنفيذه، والموعد المتوقع");
  const body = draft.body.replace("شكرًا لتعاونكم،", "تمت إضافة <ملاحظة> قبل الإرسال.");
  const pdf = new Blob(["%PDF-fixture"], { type: "application/pdf" });
  const message = await auditEmailDraft({
    ...draft,
    body,
    to: "branch@example.test",
    cc: "",
    pdf,
    pdfName: "NCR.pdf",
    renderHtml: ncrMailHtml,
  });
  const mime = await message.text();
  expect(mime).toContain("To: branch@example.test");
  expect(mime).not.toContain("\r\nCc:");
  for (const [, type, encoded] of mime.matchAll(
    /Content-Type: (text\/(?:plain|html)); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/g,
  )) {
    const decoded = Buffer.from(encoded!, "base64").toString("utf8");
    if (type === "text/plain") expect(decoded).toBe(body);
    else {
      expect(decoded).toContain("&lt;ملاحظة&gt;");
      expect(decoded).not.toContain("<ملاحظة>");
      expect(decoded).toContain("متابعة نتائج الجودة");
    }
  }
  expect(mime).toContain("filename*=UTF-8''NCR.pdf");
});

it("keeps standard audit email formatting and does not invent a priority for a branch with no findings", () => {
  const draft = ncrMailTemplate(branch, filters, summarizeNcr([...audits], []));
  expect(draft.body).toContain("لم تظهر درجات أقل من الحد الأقصى");
  expect(draft.body).not.toContain("المطلوب من الفرع:");
  expect(auditEmailHtml("88%")).toContain("#ffff00");
  expect(ncrMailHtml("88%")).not.toContain("#ffff00");
});

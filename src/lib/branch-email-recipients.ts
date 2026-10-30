import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { emailRecipients } from "./audit-email";
const targetSchema = z.object({
  branch_id: z.string().uuid(),
  branch_name: z.string(),
  to_addresses: z.array(z.string()),
  cc_addresses: z.array(z.string()),
  configured: z.boolean(),
});
export type BranchEmailTarget = z.infer<typeof targetSchema>;
export type RecipientImportRow = {
  row: number;
  branchName: string;
  branchId: string;
  to: string;
  cc: string;
};
const rpc = (name: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);
export async function loadBranchEmailDirectory() {
  const { data, error } = await rpc("sqop_branch_email_directory");
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? ""))
      return { installed: false, branches: [] as BranchEmailTarget[] };
    throw new Error("تعذر تحميل قوائم بريد الفروع");
  }
  return { installed: true, branches: z.array(targetSchema).parse(data) };
}
export async function loadAuditEmailRecipients(auditId: string) {
  const { data, error } = await rpc("sqop_audit_email_recipients", {
    p_audit_id: z.string().uuid().parse(auditId),
  });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? ""))
      return {
        installed: false,
        configured: false,
        to_addresses: [] as string[],
        cc_addresses: [] as string[],
      };
    throw new Error("تعذر التحقق من مستلمي الفرع؛ أعد المحاولة");
  }
  return { installed: true, ...targetSchema.omit({ branch_name: true }).parse(data) };
}
function branchKey(raw: string) {
  const key = raw
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\sـ_-]+/g, "");
  const aliases: Record<string, string> = {
    المعادي2: "معادي2",
    سيتيستارز: "سيتي",
    حسنينهيكل: "حسنين",
  };
  return aliases[key] ?? key;
}
export function previewRecipientRows(
  rows: unknown[][],
  branches: BranchEmailTarget[],
): RecipientImportRow[] {
  if (rows.length > 1000) throw new Error("عدد صفوف الملف أكبر من الحد المسموح");
  return rows.flatMap((row, index) => {
    if (row.every((value) => value == null || String(value).trim() === "")) return [];
    if (
      index === 0 &&
      ["الفرع", "اسم الفرع", "branch", "branch name"].includes(
        String(row[0] ?? "")
          .trim()
          .toLowerCase(),
      )
    )
      return [];
    if (typeof row[0] !== "string" || !row[0].trim())
      throw new Error(`اسم الفرع ناقص في صف ${index + 1}`);
    const matches = branches.filter((b) => branchKey(b.branch_name) === branchKey(String(row[0])));
    return [
      {
        row: index + 1,
        branchName: row[0].trim(),
        branchId: matches.length === 1 ? matches[0]!.branch_id : "",
        to: String(row[1] ?? "").trim(),
        cc: String(row[2] ?? "").trim(),
      },
    ];
  });
}
export function recipientImportPayload(rows: RecipientImportRow[]) {
  if (!rows.length) throw new Error("الملف لا يحتوي على فروع");
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!z.string().uuid().safeParse(row.branchId).success)
      throw new Error(`حدد الفرع الصحيح للصف ${row.row}: ${row.branchName}`);
    if (seen.has(row.branchId)) throw new Error(`الفرع مكرر في صف ${row.row}`);
    seen.add(row.branchId);
    try {
      const to = emailRecipients(row.to),
        toSet = new Set(to.map((a) => a.toLowerCase()));
      const cc = emailRecipients(row.cc).filter((a) => !toSet.has(a.toLowerCase()));
      if (!to.length) throw new Error("حقل To فارغ");
      return { branch_id: row.branchId, to_addresses: to, cc_addresses: cc };
    } catch (error) {
      throw new Error(
        `صف ${row.row} (${row.branchName}): ${error instanceof Error ? error.message : "عنوان غير صالح"}`,
      );
    }
  });
}
export async function saveBranchEmailRecipients(rows: RecipientImportRow[]) {
  const { error } = await rpc("sqop_save_branch_email_recipients", {
    p_rows: recipientImportPayload(rows),
  });
  if (error) throw new Error("تعذر حفظ قوائم البريد؛ لم يتم إعلان نجاح الاستيراد");
}

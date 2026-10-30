import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  loadBranchEmailDirectory,
  previewRecipientRows,
  recipientImportPayload,
  saveBranchEmailRecipients,
  type RecipientImportRow,
} from "@/lib/branch-email-recipients";
export function BranchEmailRecipientsManager() {
  const query = useQuery({
    queryKey: ["branch-email-directory"],
    queryFn: loadBranchEmailDirectory,
  });
  const client = useQueryClient(),
    lock = useRef(false);
  const [rows, setRows] = useState<RecipientImportRow[]>([]),
    [busy, setBusy] = useState(false);
  const update = (index: number, change: Partial<RecipientImportRow>) =>
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const importFile = async (file: File) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!/\.xlsx?$/i.test(file.name) || file.size > 5 * 1024 * 1024)
        throw new Error("اختار ملف Excel لا يتجاوز 5 ميجابايت");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const first = workbook.Sheets[workbook.SheetNames[0]!];
      if (!first) throw new Error("الملف فارغ");
      const preview = previewRecipientRows(
        XLSX.utils.sheet_to_json(first, { header: 1, raw: false, defval: "" }),
        query.data?.branches ?? [],
      );
      setRows(preview);
      toast.info(`تمت قراءة ${preview.length} فرع؛ راجع المطابقة والمستلمين ثم احفظ`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر قراءة الملف");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  let validation = "";
  try {
    if (rows.length) recipientImportPayload(rows);
  } catch (e) {
    validation = e instanceof Error ? e.message : "راجع البيانات";
  }
  const save = async () => {
    if (lock.current || validation || !rows.length) return;
    lock.current = true;
    setBusy(true);
    try {
      await saveBranchEmailRecipients(rows);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["branch-email-directory"] }),
        client.invalidateQueries({ queryKey: ["audit-email-recipients"] }),
      ]);
      setRows([]);
      toast.success("تم حفظ قوائم المستلمين في التخزين الخاص");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="surface-card space-y-4 p-5">
      <h2 className="font-bold">مستلمو تقارير الفروع — To وCC</h2>
      <p className="text-sm text-muted-foreground">
        القائمة مشتركة لـFS وGHP وFSMS فقط. الصيانة منفصلة ولم تُجهز بعد. ملف Excel: الفرع في العمود
        الأول، To في الثاني، CC في الثالث. القوائم تُحفظ في الداتابيز الخاصة؛ لا تُنشر داخل كود
        الموقع.
      </p>
      {query.isPending ? (
        <p role="status">جارٍ تحميل القوائم…</p>
      ) : query.isError ? (
        <>
          <p role="alert">تعذر تحميل القوائم</p>
          <Button onClick={() => void query.refetch()}>إعادة المحاولة</Button>
        </>
      ) : !query.data?.installed ? (
        <p>الاستيراد جاهز ويحتاج تفعيل إضافة التخزين الخاص بعد الموافقة على الداتابيز.</p>
      ) : (
        <>
          <label className="block text-sm">
            استيراد ملف Excel للمراجعة
            <input
              type="file"
              accept=".xlsx,.xls"
              className="mt-2 block"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importFile(file);
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            الفروع المحفوظة: {query.data.branches.filter((b) => b.configured).length} /{" "}
            {query.data.branches.length}. لحفظ تعديل يدوي استخدم «تعديل» بجوار الفرع.
          </p>
          {!rows.length && (
            <div className="grid gap-2 sm:grid-cols-2">
              {query.data.branches.map((b) => (
                <div
                  key={b.branch_id}
                  className="flex items-center justify-between gap-2 rounded border p-2"
                >
                  <span className="text-sm">
                    {b.branch_name} —{" "}
                    {b.configured
                      ? `${b.to_addresses.length} To / ${b.cc_addresses.length} CC`
                      : "غير مضبوط"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setRows([
                        {
                          row: 1,
                          branchName: b.branch_name,
                          branchId: b.branch_id,
                          to: b.to_addresses.join("; "),
                          cc: b.cc_addresses.join("; "),
                        },
                      ])
                    }
                  >
                    تعديل
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!!rows.length && (
            <fieldset disabled={busy} className="space-y-3">
              <p className="text-sm">
                معاينة {rows.length} صف. لا يتم الحفظ قبل الضغط على «حفظ القوائم».
              </p>
              <div className="max-h-[32rem] space-y-3 overflow-y-auto">
                {rows.map((row, index) => (
                  <div key={row.row} className="space-y-2 rounded border p-3">
                    <p className="font-semibold text-sm">
                      صف {row.row}: {row.branchName}
                    </p>
                    <label className="block text-xs">
                      الفرع في النظام
                      <select
                        className="mt-1 block min-h-10 w-full rounded border bg-card px-2"
                        value={row.branchId}
                        onChange={(e) => update(index, { branchId: e.target.value })}
                      >
                        <option value="">اختر الفرع — لم تتم مطابقة آمنة</option>
                        {query.data.branches.map((b) => (
                          <option key={b.branch_id} value={b.branch_id}>
                            {b.branch_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      To
                      <Textarea
                        dir="ltr"
                        value={row.to}
                        onChange={(e) => update(index, { to: e.target.value })}
                      />
                    </label>
                    <label className="block text-xs">
                      CC
                      <Textarea
                        dir="ltr"
                        value={row.cc}
                        onChange={(e) => update(index, { cc: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
              {validation && (
                <p role="alert" className="text-sm text-destructive">
                  {validation}
                </p>
              )}
              <div className="flex gap-2">
                <Button disabled={busy || !!validation} onClick={() => void save()}>
                  {busy ? "جارٍ الحفظ…" : "حفظ القوائم"}
                </Button>
                <Button variant="outline" onClick={() => setRows([])}>
                  إلغاء المعاينة
                </Button>
              </div>
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}

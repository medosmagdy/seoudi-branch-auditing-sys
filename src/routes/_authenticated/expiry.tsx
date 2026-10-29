import { cairoDate } from "@/lib/calendar-date";
import { expiryDraftValues, loadExpiryBranches, loadExpiryRecords } from "@/lib/expiry-data";
import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState, useRef } from "react";
import {
  EXPIRY_SECTIONS,
  EXPIRY_STATES,
  filterExpiryRecords,
  buildExpiryWorkbook,
  type ExpiryRecord,
  type ExpiryState,
} from "@/lib/expiry";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/expiry")({ component: ExpiryPage });

function ExpiryPage() {
  const { profile, isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(() => {
    const to = cairoDate();
    return {
      from: `${to.slice(0, 7)}-01`,
      to,
      branch: "all",
      section: "all",
      scope: "all",
      state: "all",
      review: "all",
      search: "",
    };
  });
  const [form, setForm] = useState({
    date: cairoDate(),
    branch: "",
    section: "",
    product: "",
    state: "صلاحية" as ExpiryState,
    deduction: "0",
    scope: "section",
    reason: "",
    quantity: "",
    notes: "",
  });
  const submitLock = useRef(false);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    data: branches = [],
    isLoading: branchesLoading,
    isError: branchesError,
    refetch: retryBranches,
  } = useQuery({
    queryKey: ["expiry-branches"],
    queryFn: ({ signal }) => loadExpiryBranches(signal),
  });
  const {
    data: records = [],
    isLoading,
    isError: recordsError,
    refetch: retryRecords,
  } = useQuery({
    queryKey: ["expiry-records"],
    queryFn: ({ signal }) => loadExpiryRecords(signal),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !form.branch || !form.section || !form.product.trim())
        throw new Error("أكمل البيانات المطلوبة");
      const values = expiryDraftValues(form);
      if (editingId) {
        const { data, error } = await supabase
          .from("expiry_records")
          .update(values)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("expiry_records")
        .insert({ ...values, created_by: profile.id, review_status: "pending" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم حفظ الإكسباير بنجاح");
      queryClient.invalidateQueries({ queryKey: ["expiry-records"] });
      setForm((current) => ({
        ...current,
        product: "",
        deduction: "0",
        reason: "",
        quantity: "",
        notes: "",
      }));
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin) throw new Error("غير مصرح");
      const { error } = await supabase
        .from("expiry_records")
        .delete()
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expiry-records"] }),
    onError: () => toast.error("تعذر تنفيذ العملية؛ أعد المحاولة"),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      id,
      review_status,
    }: {
      id: string;
      review_status: "pending" | "reviewed";
    }) => {
      if (!isAdmin) throw new Error("غير مصرح");
      const { error } = await supabase
        .from("expiry_records")
        .update({ review_status })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expiry-records"] }),
    onError: () => toast.error("تعذر تنفيذ العملية؛ أعد المحاولة"),
  });

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name_ar ?? "-";
  const filteredRecords = useMemo(() => filterExpiryRecords(records, filters), [filters, records]);

  const exportExcel = async () => {
    if (exportLock.current || recordsError || branchesError || isLoading || branchesLoading) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = buildExpiryWorkbook(XLSX, filteredRecords, branches);
      XLSX.writeFile(workbook, `expiry-${cairoDate().slice(0, 7)}.xlsx`);
    } catch {
      toast.error("تعذر تصدير سجل الإكسبيرات؛ أعد المحاولة");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  };
  const busy = saveMutation.isPending || deleteMutation.isPending || reviewMutation.isPending;

  return (
    <AppShell
      contentClassName="expiry-page"
      title="تسجيل الإكسبيرات"
      subtitle="تسجيل ومتابعة الإكسبيرات حسب الشهر والفرع والقسم"
    >
      <div className="flex flex-col gap-6">
        {(branchesError || recordsError) && (
          <div
            role="alert"
            className="surface-card rounded-xl border border-destructive/30 p-4 space-y-2"
          >
            <p>تعذر تحميل الفروع أو سجل الإكسبيرات كاملًا. أعد المحاولة قبل التعديل أو التصدير.</p>
            <Button
              variant="outline"
              onClick={() => {
                if (branchesError) void retryBranches();
                if (recordsError) void retryRecords();
              }}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "تعديل الإكسباير" : "إضافة إكسباير"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (submitLock.current || busy || branchesError || branchesLoading || recordsError)
                  return;
                submitLock.current = true;
                saveMutation.mutate(undefined, {
                  onSettled: () => {
                    submitLock.current = false;
                  },
                });
              }}
            >
              <fieldset
                disabled={busy || branchesLoading || branchesError || recordsError}
                className="contents"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="expiry-date">التاريخ</Label>
                  <Input
                    id="expiry-date"
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm({ ...form, date: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>الفرع</Label>
                  <Select
                    value={form.branch}
                    onValueChange={(branch) => setForm({ ...form, branch })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name_ar}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>القسم</Label>
                  <Select
                    value={form.section}
                    onValueChange={(section) => setForm({ ...form, section })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_SECTIONS.map((section) => (
                        <SelectItem key={section} value={section}>
                          {section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <Label htmlFor="expiry-product">المنتجات المنتهية / التزوير / التدوير</Label>
                  <Input
                    id="expiry-product"
                    value={form.product}
                    onChange={(event) => setForm({ ...form, product: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>الحالة</Label>
                  <Select
                    value={form.state}
                    onValueChange={(state: ExpiryState) => setForm({ ...form, state })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="quantity">عدد القطع</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity}
                    onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="deduction">الخصم %</Label>
                  <Input
                    id="deduction"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.deduction}
                    onChange={(event) => setForm({ ...form, deduction: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>نوع الخصم</Label>
                  <Select value={form.scope} onValueChange={(scope) => setForm({ ...form, scope })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="section">قسم</SelectItem>
                      <SelectItem value="branch">فرع</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 lg:col-span-2">
                  <Label htmlFor="expiry-notes">ملاحظات</Label>
                  <Textarea
                    id="expiry-notes"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </div>
                <div className="lg:col-span-3">
                  <Button type="submit" disabled={busy}>
                    <CalendarDays data-icon="inline-start" />
                    {saveMutation.isPending
                      ? "جارٍ الحفظ..."
                      : editingId
                        ? "حفظ التعديل"
                        : "حفظ الإكسباير"}
                  </Button>
                  {editingId && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="ms-2"
                      onClick={() => {
                        setEditingId(null);
                        setForm((current) => ({
                          ...current,
                          product: "",
                          deduction: "0",
                          reason: "",
                          quantity: "",
                          notes: "",
                        }));
                        saveMutation.reset();
                      }}
                    >
                      إلغاء التعديل
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
            {saveMutation.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {(saveMutation.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>سجل الإكسبيرات</CardTitle>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={
                exporting ||
                isLoading ||
                branchesLoading ||
                recordsError ||
                branchesError ||
                !filteredRecords.length
              }
            >
              <Download data-icon="inline-start" />
              {exporting ? "جاري تجهيز الملف…" : "استخراج Excel"}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="absolute right-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="بحث بالمنتج أو الملاحظات"
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                />
              </div>
              <Input
                type="date"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
              <Input
                type="date"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
              <Select
                value={filters.branch}
                onValueChange={(branch) => setFilters({ ...filters, branch })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="كل الفروع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.section}
                onValueChange={(section) => setFilters({ ...filters, section })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="كل الأقسام" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {EXPIRY_SECTIONS.map((section) => (
                    <SelectItem key={section} value={section}>
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.scope}
                onValueChange={(scope) => setFilters({ ...filters, scope })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="نوع الخصم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل أنواع الخصم</SelectItem>
                  <SelectItem value="section">قسم</SelectItem>
                  <SelectItem value="branch">فرع</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.state}
                onValueChange={(state) => setFilters({ ...filters, state })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {EXPIRY_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.review}
                onValueChange={(review) => setFilters({ ...filters, review })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="كل حالات المراجعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل حالات المراجعة</SelectItem>
                  <SelectItem value="pending">لم تتم مراجعتها</SelectItem>
                  <SelectItem value="reviewed">تمت مراجعتها</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recordsError ? (
              <p className="text-sm text-destructive">
                السجل غير متاح حاليًا؛ أعد المحاولة من أعلى الصفحة.
              </p>
            ) : isLoading ? (
              <p className="text-sm text-muted-foreground">جارٍ تحميل السجل...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-right text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">الفرع</th>
                      <th className="p-3">القسم</th>
                      <th className="p-3">المنتج</th>
                      <th className="p-3">عدد القطع</th>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3">الخصم</th>
                      <th className="p-3">نوع الخصم</th>
                      <th className="p-3">المراجعة</th>
                      <th className="p-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => {
                      const editable =
                        isAdmin ||
                        (record.created_by === profile?.id && record.review_status === "pending");
                      return (
                        <tr key={record.id} className="border-b">
                          <td className="p-3">{branchName(record.branch_id)}</td>
                          <td className="p-3">{record.section}</td>
                          <td className="p-3">{record.product_name}</td>
                          <td className="p-3">{record.quantity ?? "-"}</td>
                          <td className="p-3">{record.expiry_date}</td>
                          <td className="p-3">
                            <Badge variant="secondary">
                              {record.expiry_state ||
                                (record as ExpiryRecord & { status?: string }).status ||
                                "-"}
                            </Badge>
                          </td>
                          <td className="p-3">{record.deduction_percentage}%</td>
                          <td className="p-3">
                            {record.deduction_scope === "section" ? "قسم" : "فرع"}
                          </td>
                          <td className="p-3">
                            {record.review_status === "reviewed" ? (
                              <Badge>تمت مراجعتها</Badge>
                            ) : (
                              <Badge variant="outline">لم تتم مراجعتها</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {editable && (
                                <Button
                                  size="sm"
                                  disabled={busy || branchesError}
                                  variant="outline"
                                  onClick={() => {
                                    setEditingId(record.id);
                                    setForm({
                                      date: record.expiry_date,
                                      branch: record.branch_id,
                                      section: record.section,
                                      product: record.product_name,
                                      state: record.expiry_state,
                                      deduction: String(record.deduction_percentage),
                                      scope: record.deduction_scope,
                                      reason: record.deduction_reason ?? "",
                                      quantity:
                                        record.quantity == null ? "" : String(record.quantity),
                                      notes: record.notes ?? "",
                                    });
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                >
                                  <Pencil data-icon="inline-start" />
                                  تعديل
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  disabled={busy || branchesError}
                                  variant="outline"
                                  className="text-destructive"
                                  onClick={() => {
                                    if (window.confirm("هل تريد حذف هذا الإكسباير؟"))
                                      deleteMutation.mutate(record.id);
                                  }}
                                >
                                  <Trash2 data-icon="inline-start" />
                                  حذف
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  disabled={busy || branchesError}
                                  variant="outline"
                                  onClick={() =>
                                    reviewMutation.mutate({
                                      id: record.id,
                                      review_status:
                                        record.review_status === "reviewed"
                                          ? "pending"
                                          : "reviewed",
                                    })
                                  }
                                >
                                  <ShieldCheck data-icon="inline-start" />
                                  {record.review_status === "reviewed"
                                    ? "إلغاء المراجعة"
                                    : "تمت المراجعة"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filteredRecords.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    لا توجد نتائج مطابقة للفلاتر.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function isExpiryState(value: string): value is ExpiryState {
  return EXPIRY_STATES.includes(value as ExpiryState);
}
void isExpiryState;

export default ExpiryPage;

export type { ExpiryRecord };

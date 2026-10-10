import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, ImagePlus, Pencil, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

const EXPIRY_SECTIONS = ["الأسماك", "الجزارة", "الجبن", "المخبوزات", "الخضروات و الفاكهة", "المبردات", "المجمدات", "الوجبات الجاهزة", "البقالة الجافة", "التوصيل", "الاستلامات", "عام"] as const;
const EXPIRY_STATES = ["صلاحية", "تزوير", "تدوير"] as const;
type ExpiryState = (typeof EXPIRY_STATES)[number];

type ExpiryRecord = {
  id: string;
  expiry_date: string;
  branch_id: string;
  section: string;
  product_name: string;
  expiry_state: ExpiryState;
  deduction_percentage: number;
  deduction_scope: "section" | "branch";
  deduction_reason: string | null;
  quantity: number | null;
  notes: string | null;
  created_by: string;
  review_status: "pending" | "reviewed";
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/expiry")({ component: ExpiryPage });

function ExpiryPage() {
  const { profile, isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ from: "", to: "", branch: "all", section: "all", state: "all", review: "all", search: "" });
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), branch: "", section: "", product: "", state: "صلاحية" as ExpiryState, deduction: "0", scope: "section", reason: "", quantity: "", notes: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["expiry-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name_ar").order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["expiry-records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expiry_records").select("*").order("expiry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpiryRecord[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !form.branch || !form.section || !form.product.trim()) throw new Error("أكمل البيانات المطلوبة");
      const values = {
        expiry_date: form.date,
        branch_id: form.branch,
        section: form.section,
        product_name: form.product.trim(),
        expiry_state: form.state,
        deduction_percentage: Number(form.deduction) || 0,
        deduction_scope: form.scope,
        deduction_reason: form.reason.trim() || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        notes: form.notes.trim() || null,
        created_by: profile.id,
        review_status: "pending",
      };
      if (editingId) {
        const { data, error } = await supabase.from("expiry_records").update(values).eq("id", editingId).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("expiry_records").insert({ ...values, created_by: profile.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expiry-records"] });
      setForm((current) => ({ ...current, product: "", deduction: "0", reason: "", quantity: "", notes: "" }));
      setEditingId(null);
      setFiles([]);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, review_status }: { id: string; review_status: "pending" | "reviewed" }) => {
      const { error } = await supabase.from("expiry_records").update({ review_status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expiry-records"] }),
  });

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name_ar ?? "-";
  const filteredRecords = useMemo(() => records.filter((record) => {
    const searchable = `${record.product_name} ${record.notes ?? ""} ${record.deduction_reason ?? ""}`.toLowerCase();
    return (!filters.from || record.expiry_date >= filters.from) && (!filters.to || record.expiry_date <= filters.to) && (filters.branch === "all" || record.branch_id === filters.branch) && (filters.section === "all" || record.section === filters.section) && (filters.state === "all" || record.expiry_state === filters.state) && (filters.review === "all" || record.review_status === filters.review) && (!filters.search || searchable.includes(filters.search.toLowerCase()));
  }), [filters, records]);

  const exportExcel = () => {
    const rows = filteredRecords.map((record) => ({
      "الفرع": branchName(record.branch_id),
      "القسم": record.section,
      "المنتجات المنتهية / التزوير / التدوير": record.product_name,
      "التاريخ": record.expiry_date,
      "العدد": record.quantity ?? "",
      "الخصم": record.deduction_percentage ? `${record.deduction_percentage}%` : "",
      "نوع الخصم": record.deduction_scope === "section" ? "قسم" : "فرع",
      "سبب الخصم": record.deduction_reason ?? "",
      "الحالة": record.expiry_state,
      "حالة المراجعة": record.review_status === "reviewed" ? "تمت مراجعتها" : "لم تتم مراجعتها",
      "ملاحظات": record.notes ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!dir"] = "rtl";
    sheet["!cols"] = [18, 20, 36, 14, 10, 12, 14, 28, 14, 20, 32].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "الإكسبيرات");
    XLSX.writeFile(workbook, `expiry-${new Date().toISOString().slice(0, 7)}.xlsx`);
  };

  return <AppShell title="تسجيل الإكسبيرات" subtitle="تسجيل ومتابعة الإكسبيرات حسب الشهر والفرع والقسم">
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>{editingId ? "تعديل الإكسباير" : "إضافة إكسباير"}</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }}>
            <div className="flex flex-col gap-2"><Label htmlFor="expiry-date">التاريخ</Label><Input id="expiry-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label>الفرع</Label><Select value={form.branch} onValueChange={(branch) => setForm({ ...form, branch })}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name_ar}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label>القسم</Label><Select value={form.section} onValueChange={(section) => setForm({ ...form, section })}><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent>{EXPIRY_SECTIONS.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2 lg:col-span-2"><Label htmlFor="expiry-product">المنتجات المنتهية / التزوير / التدوير</Label><Input id="expiry-product" value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label>الحالة</Label><Select value={form.state} onValueChange={(state: ExpiryState) => setForm({ ...form, state })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EXPIRY_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="quantity">عدد القطع</Label><Input id="quantity" type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="deduction">الخصم %</Label><Input id="deduction" type="number" min="0" max="100" step="0.01" value={form.deduction} onChange={(event) => setForm({ ...form, deduction: event.target.value })} /></div>
            <div className="flex flex-col gap-2"><Label>نوع الخصم</Label><Select value={form.scope} onValueChange={(scope) => setForm({ ...form, scope })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="section">قسم</SelectItem><SelectItem value="branch">فرع</SelectItem></SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="deduction-reason">سبب الخصم</Label><Input id="deduction-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div>
            <div className="flex flex-col gap-2 lg:col-span-2"><Label htmlFor="expiry-notes">ملاحظات</Label><Textarea id="expiry-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            <div className="flex flex-col gap-2 lg:col-span-3"><Label htmlFor="expiry-images">صور الإكسباير</Label><label htmlFor="expiry-images" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:bg-muted/50"><ImagePlus className="size-5" /><span>{files.length ? `تم اختيار ${files.length} صورة` : "إرفاق صورة أو أكثر"}</span><Input id="expiry-images" type="file" accept="image/*" multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label></div>
            <div className="lg:col-span-3"><Button type="submit" disabled={saveMutation.isPending}><CalendarDays data-icon="inline-start" />{saveMutation.isPending ? "جارٍ الحفظ..." : editingId ? "حفظ التعديل" : "حفظ الإكسباير"}</Button></div>
          </form>
          {saveMutation.error && <p className="mt-3 text-sm text-destructive">{(saveMutation.error as Error).message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><CardTitle>سجل الإكسبيرات</CardTitle><Button variant="outline" onClick={exportExcel}><Download data-icon="inline-start" />استخراج Excel</Button></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><div className="relative"><Search className="absolute right-3 top-3 size-4 text-muted-foreground" /><Input className="pr-9" placeholder="بحث بالمنتج أو الملاحظات" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div><Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /><Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /><Select value={filters.branch} onValueChange={(branch) => setFilters({ ...filters, branch })}><SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger><SelectContent><SelectItem value="all">كل الفروع</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name_ar}</SelectItem>)}</SelectContent></Select><Select value={filters.section} onValueChange={(section) => setFilters({ ...filters, section })}><SelectTrigger><SelectValue placeholder="كل الأقسام" /></SelectTrigger><SelectContent><SelectItem value="all">كل الأقسام</SelectItem>{EXPIRY_SECTIONS.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}</SelectContent></Select><Select value={filters.state} onValueChange={(state) => setFilters({ ...filters, state })}><SelectTrigger><SelectValue placeholder="كل الحالات" /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem>{EXPIRY_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select><Select value={filters.review} onValueChange={(review) => setFilters({ ...filters, review })}><SelectTrigger><SelectValue placeholder="كل حالات المراجعة" /></SelectTrigger><SelectContent><SelectItem value="all">كل حالات المراجعة</SelectItem><SelectItem value="pending">لم تتم مراجعتها</SelectItem><SelectItem value="reviewed">تمت مراجعتها</SelectItem></SelectContent></Select></div>
          {isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل السجل...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-right text-sm"><thead><tr className="border-b"><th className="p-3">الفرع</th><th className="p-3">القسم</th><th className="p-3">المنتج</th><th className="p-3">التاريخ</th><th className="p-3">الحالة</th><th className="p-3">الخصم</th><th className="p-3">المراجعة</th><th className="p-3">إجراء</th></tr></thead><tbody>{filteredRecords.map((record) => { const editable = isAdmin || (record.created_by === profile?.id && record.review_status === "pending"); return <tr key={record.id} className="border-b"><td className="p-3">{branchName(record.branch_id)}</td><td className="p-3">{record.section}</td><td className="p-3">{record.product_name}</td><td className="p-3">{record.expiry_date}</td><td className="p-3"><Badge variant="secondary">{record.expiry_state}</Badge></td><td className="p-3">{record.deduction_percentage}%</td><td className="p-3">{record.review_status === "reviewed" ? <Badge>تمت مراجعتها</Badge> : <Badge variant="outline">لم تتم مراجعتها</Badge>}</td><td className="p-3"><div className="flex items-center gap-2">{editable && <Button size="sm" variant="outline" onClick={() => { setEditingId(record.id); setForm({ date: record.expiry_date, branch: record.branch_id, section: record.section, product: record.product_name, state: record.expiry_state, deduction: String(record.deduction_percentage), scope: record.deduction_scope, reason: record.deduction_reason ?? "", quantity: record.quantity == null ? "" : String(record.quantity), notes: record.notes ?? "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil data-icon="inline-start" />تعديل</Button>}{isAdmin && <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate({ id: record.id, review_status: record.review_status === "reviewed" ? "pending" : "reviewed" })}><ShieldCheck data-icon="inline-start" />{record.review_status === "reviewed" ? "إلغاء المراجعة" : "تمت المراجعة"}</Button>}</div></td></tr>; })}</tbody></table>{!filteredRecords.length && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للفلاتر.</p>}</div>}
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}

function isExpiryState(value: string): value is ExpiryState { return EXPIRY_STATES.includes(value as ExpiryState); }
void isExpiryState;

export default ExpiryPage;

export type { ExpiryRecord };

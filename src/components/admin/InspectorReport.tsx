import {
  LayoutDashboard,
  ClipboardList,
  Store,
  BarChart3,
  ArrowDown,
  ArrowUp,
  SlidersHorizontal,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadReportModel } from "@/lib/report-data";
import { mapLimited, summarizeInspector } from "@/lib/inspector-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
export function InspectorReport({
  user,
  onClose,
}: {
  user: { id: string; full_name: string };
  onClose: () => void;
}) {
  const [tab, setTab] = useState("summary");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("all");
  const [program, setProgram] = useState("all");
  const [page, setPage] = useState(0);
  const [sectionPage, setSectionPage] = useState(0);
  const [sectionSort, setSectionSort] = useState("loss");
  const query = useQuery({
    queryKey: ["inspector-audits", user.id],
    queryFn: async () => {
      const rows: {
        id: string;
        audit_date: string;
        status: string;
        branch_id: string;
        audit_type_id: string;
        branchName: string;
        programName: string;
      }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("audits")
          .select(
            "id,audit_date,status,branch_id,audit_type_id,branches(name_ar),audit_types(name_ar)",
          )
          .eq("auditor_id", user.id)
          .order("audit_date", { ascending: false })
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        for (const row of data ?? [])
          rows.push({
            ...row,
            branchName: row.branches?.name_ar ?? "غير محدد",
            programName: row.audit_types?.name_ar ?? "غير محدد",
          });
        if ((data?.length ?? 0) < 500) return rows;
      }
    },
    refetchOnWindowFocus: false,
  });
  const invalidRange = !!from && !!to && from > to;
  const rows = useMemo(
    () =>
      (query.data ?? []).filter(
        (r) =>
          !invalidRange &&
          (!from || r.audit_date >= from) &&
          (!to || r.audit_date <= to) &&
          (branch === "all" || r.branch_id === branch) &&
          (program === "all" || r.audit_type_id === program),
      ),
    [query.data, from, to, branch, program, invalidRange],
  );
  const submitted = rows.filter((r) => r.status === "submitted" || r.status === "approved");
  const models = useQuery({
    queryKey: ["inspector-analysis", user.id, submitted.map((r) => r.id)],
    queryFn: () =>
      mapLimited(submitted, (row) => loadReportModel(row.id, { includePhotos: false })),
    enabled: !!query.data && !invalidRange,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const analysis = useMemo(
    () => (!invalidRange && models.data ? summarizeInspector(models.data) : null),
    [models.data, invalidRange],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  const sectionRows = [...(analysis?.sections ?? [])].sort((a, b) =>
    sectionSort === "full" ? b.full - a.full || b.fullRate - a.fullRate : a.score - b.score,
  );
  const sectionPages = Math.max(1, Math.ceil(sectionRows.length / 10));
  const currentSection = Math.min(sectionPage, sectionPages - 1);
  const options = (key: "branch_id" | "audit_type_id", name: "branchName" | "programName") => [
    ...new Map((query.data ?? []).map((r) => [r[key], r[name]])).entries(),
  ];
  const resetPages = () => {
    setPage(0);
    setSectionPage(0);
  };
  const drafts = rows.filter((r) => ["draft", "in_progress"].includes(r.status)).length;
  const counters = [
    { label: "كل الفحوصات", value: rows.length, tone: "border-primary/20 bg-primary/5" },
    { label: "المعتمدة", value: submitted.length, tone: "border-emerald-500/20 bg-emerald-500/5" },
    { label: "المسودات", value: drafts, tone: "border-amber-500/20 bg-amber-500/5" },
    {
      label: "الفروع التي زارها",
      value: new Set(rows.map((r) => r.branch_id)).size,
      tone: "border-sky-500/20 bg-sky-500/5",
    },
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        dir="rtl"
      >
        <div className="shrink-0 border-b bg-muted/20 p-4 sm:p-5">
          <DialogHeader className="pr-7 text-right sm:text-right">
            <DialogTitle className="text-lg font-bold">تقرير المفتش — {user.full_name}</DialogTitle>
            <DialogDescription className="text-xs">
              اختر الفترة والفرع والبرنامج، ثم انتقل بين الملخص والفحوصات والفروع والأقسام.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-xl border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <SlidersHorizontal className="size-3.5" /> فلاتر التقرير
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setBranch("all");
                  setProgram("all");
                  resetPages();
                }}
              >
                مسح الفلاتر
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-xs">
                من تاريخ
                <Input
                  className="h-9"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    resetPages();
                  }}
                />
              </label>
              <label className="space-y-1 text-xs">
                إلى تاريخ
                <Input
                  className="h-9"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    resetPages();
                  }}
                />
              </label>
              <label className="space-y-1 text-xs">
                الفرع
                <select
                  className="block h-9 w-full rounded-md border bg-background px-2"
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    resetPages();
                  }}
                >
                  <option value="all">كل الفروع</option>
                  {options("branch_id", "branchName").map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                نوع الفحص
                <select
                  className="block h-9 w-full rounded-md border bg-background px-2"
                  value={program}
                  onChange={(e) => {
                    setProgram(e.target.value);
                    resetPages();
                  }}
                >
                  <option value="all">كل الأوديتس</option>
                  {options("audit_type_id", "programName").map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              الفلاتر تطبّق على جميع التبويبات ·{" "}
              {from || to ? `${from || "البداية"} ← ${to || "اليوم"}` : "كل الفترات"}
            </p>
          </div>
          {invalidRange && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              تاريخ البداية يجب ألا يتجاوز النهاية.
            </p>
          )}
        </div>
        <Tabs value={tab} onValueChange={setTab} dir="rtl" className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-3 sm:px-5">
            <TabsList
              aria-label="أقسام تقرير المفتش"
              className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl p-1"
            >
              <TabsTrigger value="summary" className="gap-1 px-1 py-2 text-xs sm:text-sm">
                <LayoutDashboard className="hidden size-4 sm:block" />
                الملخص
              </TabsTrigger>
              <TabsTrigger value="audits" className="gap-1 px-1 py-2 text-xs sm:text-sm">
                <ClipboardList className="hidden size-4 sm:block" />
                الفحوصات
              </TabsTrigger>
              <TabsTrigger value="branches" className="gap-1 px-1 py-2 text-xs sm:text-sm">
                <Store className="hidden size-4 sm:block" />
                الفروع
              </TabsTrigger>
              <TabsTrigger value="sections" className="gap-1 px-1 py-2 text-xs sm:text-sm">
                <BarChart3 className="hidden size-4 sm:block" />
                الأقسام
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
            {query.isPending && (
              <p className="py-6 text-center text-sm" role="status">
                جاري تحميل الفحوصات…
              </p>
            )}
            {query.isError && (
              <div
                className="my-3 rounded-lg border border-destructive/30 p-3 text-sm"
                role="alert"
              >
                تعذر تحميل الفحوصات.{" "}
                <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {query.data && !invalidRange && (
              <>
                {!!analysis?.unresolved && (
                  <p
                    className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
                    role="status"
                  >
                    يحتاج للمراجعة: استُبعد {analysis.unresolved} فحص من المقارنات لوجود درجة فارغة
                    غير N/A. يظل ظاهرًا في قائمة الفحوصات.
                  </p>
                )}
                {models.isError && (
                  <div
                    className="mt-3 rounded-lg border border-destructive/30 p-3 text-sm"
                    role="alert"
                  >
                    تعذر تحميل التحليل كاملًا؛ قائمة الفحوصات متاحة.{" "}
                    <Button size="sm" variant="outline" onClick={() => void models.refetch()}>
                      إعادة تحميل التحليل
                    </Button>
                  </div>
                )}
                <TabsContent value="summary" className="space-y-4 pt-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {counters.map((card) => (
                      <div className={`rounded-xl border p-3 ${card.tone}`} key={card.label}>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold tabular-nums">{card.value}</p>
                      </div>
                    ))}
                  </div>
                  {models.isPending && (
                    <p className="rounded-xl border p-5 text-center text-sm" role="status">
                      جاري تحليل نتائج الفحوصات المعتمدة…
                    </p>
                  )}
                  {analysis && (
                    <>
                      <section className="rounded-xl border p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold">متوسط تقييم الزيارات المعتمدة</h3>
                          <span className="rounded-full bg-muted px-2 py-1 text-[11px]">
                            {analysis.scoredVisits} زيارة محتسبة
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-muted/40 p-4">
                            <p className="text-xs text-muted-foreground">قبل جميع الخصومات</p>
                            <p className="mt-2 text-2xl font-bold tabular-nums">
                              {pct(analysis.before)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <p className="text-xs text-muted-foreground">بعد جميع الخصومات</p>
                            <p className="mt-2 text-3xl font-bold tabular-nums text-primary">
                              {pct(analysis.after)}
                            </p>
                          </div>
                        </div>
                        <details className="mt-3 rounded-lg border p-3 text-xs">
                          <summary className="cursor-pointer font-semibold">
                            تفصيل أثر الخصومات
                          </summary>
                          <dl className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                              <dt className="text-muted-foreground">خصومات الأقسام</dt>
                              <dd className="mt-1 font-bold">
                                {analysis.sectionDeduction ?? "—"} نقطة مئوية
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">الخصومات العامة</dt>
                              <dd className="mt-1 font-bold">
                                {analysis.generalDeduction ?? "—"} نقطة مئوية
                              </dd>
                            </div>
                          </dl>
                        </details>
                      </section>
                      {!analysis.scoredVisits && (
                        <p className="rounded-lg bg-muted/40 p-3 text-sm">
                          لا توجد زيارات معتمدة صالحة للمقارنة ضمن الفلاتر الحالية.
                        </p>
                      )}
                    </>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      {
                        value: "audits",
                        title: "قائمة الفحوصات",
                        text: "التواريخ والحالات وفتح كل فحص",
                      },
                      {
                        value: "branches",
                        title: "أعلى وأقل الفروع",
                        text: "مقارنة منفصلة لكل برنامج",
                      },
                      {
                        value: "sections",
                        title: "تحليل الأقسام",
                        text: "أكثر فقدًا ومرات الحصول على 100%",
                      },
                    ].map((item) => (
                      <button
                        className="rounded-xl border p-3 text-right transition-colors hover:bg-muted/40"
                        key={item.value}
                        onClick={() => setTab(item.value)}
                      >
                        <span className="block text-sm font-semibold text-primary">
                          {item.title} ←
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    التحليل للمعتمد فقط وبمتوسط الزيارات، بدون أوزان Dashboard الشهرية. اختلاف
                    الفروع وعدد الزيارات يؤثر على المقارنة بين المفتشين.
                  </p>
                </TabsContent>
                <TabsContent value="audits" className="space-y-3 pt-3">
                  <div>
                    <h3 className="text-sm font-bold">سجل فحوصات المفتش</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rows.length} فحص ضمن الفلاتر الحالية · المعتمد والمسودات
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[540px] text-right text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          {["التاريخ", "الفرع", "البرنامج", "الحالة", "فتح"].map((v) => (
                            <th className="p-3 text-xs font-semibold" key={v}>
                              {v}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(current * 10, current * 10 + 10).map((r) => (
                          <tr className="border-t hover:bg-muted/20" key={r.id}>
                            <td className="p-3 tabular-nums">{r.audit_date}</td>
                            <td className="p-3 font-medium">{r.branchName}</td>
                            <td className="p-3">{r.programName}</td>
                            <td className="p-3">
                              <span
                                className={`rounded-full px-2 py-1 text-xs ${["submitted", "approved"].includes(r.status) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                              >
                                {["submitted", "approved"].includes(r.status)
                                  ? "معتمد"
                                  : ["draft", "in_progress"].includes(r.status)
                                    ? "مسودة"
                                    : r.status}
                              </span>
                            </td>
                            <td className="p-3">
                              <Link
                                className="text-xs font-semibold text-primary underline underline-offset-4"
                                to="/audits/$id/summary"
                                params={{ id: r.id }}
                              >
                                فتح الفحص
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      لا توجد فحوصات مطابقة.
                    </p>
                  )}
                  <ReportPagination current={current} pages={pages} onPage={setPage} />
                </TabsContent>
                <TabsContent value="branches" className="space-y-3 pt-3">
                  <div>
                    <h3 className="text-sm font-bold">أعلى وأقل الفروع تقييمًا لكل برنامج</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      بعد جميع الخصومات، بمتوسط زيارات الفرع. يظهر عدد الزيارات وجميع المتعادلين.
                    </p>
                  </div>
                  {models.isPending && (
                    <p className="py-6 text-center text-sm">جاري تحميل المقارنة…</p>
                  )}
                  {analysis && !analysis.programs.length && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      لا توجد فروع صالحة للمقارنة ضمن الفلاتر الحالية.
                    </p>
                  )}
                  <div className="grid gap-3 lg:grid-cols-2">
                    {analysis?.programs.map((p) => (
                      <section className="rounded-xl border" key={p.program}>
                        <h4 className="border-b bg-muted/30 px-4 py-3 text-sm font-bold">
                          {p.program}
                        </h4>
                        <div className="space-y-4 p-4">
                          <div>
                            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              <ArrowUp className="size-3.5" />
                              الأعلى تقييمًا
                            </p>
                            {p.highest.map((r) => (
                              <div
                                key={r.branch}
                                className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-emerald-500/5 p-3"
                              >
                                <span className="text-sm font-medium">
                                  {r.branch}
                                  <span className="mt-1 block text-[11px] text-muted-foreground">
                                    {r.visits} زيارة
                                  </span>
                                </span>
                                <strong className="text-lg tabular-nums">{r.score}%</strong>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              <ArrowDown className="size-3.5" />
                              الأقل تقييمًا
                            </p>
                            {p.lowest.map((r) => (
                              <div
                                key={r.branch}
                                className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-amber-500/5 p-3"
                              >
                                <span className="text-sm font-medium">
                                  {r.branch}
                                  <span className="mt-1 block text-[11px] text-muted-foreground">
                                    {r.visits} زيارة
                                  </span>
                                </span>
                                <strong className="text-lg tabular-nums">{r.score}%</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="sections" className="space-y-3 pt-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold">تحليل الأقسام</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        نتيجة القسم بعد خصمه وقبل الخصم العام. الفقد معروض بالنقاط المئوية.
                      </p>
                    </div>
                    <label className="text-xs">
                      ترتيب الأقسام
                      <select
                        aria-label="ترتيب تحليل الأقسام"
                        className="mt-1 block h-9 rounded-md border bg-background px-2"
                        value={sectionSort}
                        onChange={(e) => {
                          setSectionSort(e.target.value);
                          setSectionPage(0);
                        }}
                      >
                        <option value="loss">الأكثر فقدًا في النسبة أولًا</option>
                        <option value="full">الأكثر حصولًا على 100% أولًا</option>
                      </select>
                    </label>
                  </div>
                  {models.isPending && (
                    <p className="py-6 text-center text-sm">جاري تحميل تحليل الأقسام…</p>
                  )}
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[760px] text-right text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          {[
                            "البرنامج",
                            "القسم",
                            "الزيارات",
                            "متوسط النتيجة",
                            "فقد درجات البنود",
                            "أثر خصم القسم",
                            "مرات 100%",
                            "نسبة مرات 100%",
                          ].map((h) => (
                            <th className="p-3 font-semibold" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sectionRows
                          .slice(currentSection * 10, currentSection * 10 + 10)
                          .map((r) => (
                            <tr
                              className="border-t hover:bg-muted/20"
                              key={`${r.program}-${r.section}`}
                            >
                              <td className="p-3">{r.program}</td>
                              <td className="p-3 font-semibold">{r.section}</td>
                              <td className="p-3 tabular-nums">{r.visits}</td>
                              <td className="p-3 font-bold tabular-nums">{r.score}%</td>
                              <td className="p-3 tabular-nums">{r.itemLoss}</td>
                              <td className="p-3 tabular-nums">{r.deductionLoss}</td>
                              <td className="p-3 tabular-nums">{r.full}</td>
                              <td className="p-3 tabular-nums">{r.fullRate}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {analysis && !sectionRows.length && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      لا توجد أقسام صالحة للتحليل ضمن الفلاتر الحالية.
                    </p>
                  )}
                  <ReportPagination
                    current={currentSection}
                    pages={sectionPages}
                    onPage={setSectionPage}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ReportPagination({
  current,
  pages,
  onPage,
}: {
  current: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2 text-xs">
      <Button size="sm" variant="outline" disabled={!current} onClick={() => onPage(current - 1)}>
        السابق
      </Button>
      <span>
        صفحة {current + 1} من {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={current === pages - 1}
        onClick={() => onPage(current + 1)}
      >
        التالي
      </Button>
    </div>
  );
}

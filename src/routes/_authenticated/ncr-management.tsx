import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ListChecks, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NcrAnalysisView } from "@/components/ncr/NcrAnalysisView";
import { useSession } from "@/hooks/useSession";
import {
  ncrFiltersSchema,
  ncrPeriodBounds,
  ncrProgram,
  normalizeNcrText,
  type NcrPeriod,
  type NcrProgram,
} from "@/lib/ncr-management";
import { loadNcrAnalysis, loadNcrBranches } from "@/lib/report-feature-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ncr-management")({
  component: NcrManagementPage,
});

function cairoToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function NcrManagementPage() {
  const { profile } = useSession();
  const branches = useQuery({
    queryKey: ["ncr-branches", profile?.id],
    queryFn: loadNcrBranches,
    enabled: !!profile?.id,
    retry: false,
    staleTime: 30_000,
  });
  const [selected, setSelected] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [period, setPeriod] = useState<NcrPeriod>("month");
  const [anchor, setAnchor] = useState(() => cairoToday().slice(0, 7));
  const [custom, setCustom] = useState(() => ncrPeriodBounds("month", cairoToday()));
  const [program, setProgram] = useState<NcrProgram>("both");
  const [bounds, setBounds] = useState(() => ncrPeriodBounds("month", cairoToday()));
  const [appliedProgram, setAppliedProgram] = useState<NcrProgram>("both");
  const [notice, setNotice] = useState("");
  const selectedYear = anchor.slice(0, 4);
  const currentYear = Number(cairoToday().slice(0, 4));
  const years = [
    ...new Set([
      ...Array.from({ length: 12 }, (_, i) => String(currentYear + 1 - i)),
      selectedYear,
    ]),
  ].filter(Boolean);
  const selectedQuarter = String(Math.ceil(Number(anchor.slice(5)) / 3) || 1);
  const validated = ncrFiltersSchema.safeParse({
    branchId: selected,
    program: appliedProgram,
    ...bounds,
  });
  const filters = validated.success ? validated.data : null;
  const report = useQuery({
    queryKey: ["ncr-analysis", profile?.id, filters],
    queryFn: () => loadNcrAnalysis(filters!),
    enabled: !!filters && (branches.data ?? []).some((branch) => branch.id === selected),
    retry: false,
  });
  const visible = (branches.data ?? []).filter((branch) =>
    normalizeNcrText(branch.name).includes(normalizeNcrText(branchSearch)),
  );
  const analysis = report.isSuccess && report.data.branch.id === selected ? report.data : null;
  function applyPeriod() {
    const reference =
      anchor || (period === "year" || period === "quarter" ? cairoToday().slice(0, 7) : "");
    if (period !== "custom" && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(reference)) {
      setNotice("اختار شهرًا مرجعيًا صالحًا");
      return;
    }
    const next = period === "custom" ? custom : ncrPeriodBounds(period, reference);
    // Parse with a harmless placeholder when filters are edited before a branch is picked.
    if (
      !ncrFiltersSchema.safeParse({
        branchId: selected || "00000000-0000-4000-8000-000000000000",
        program,
        ...next,
      }).success
    ) {
      setNotice("اختار تاريخ بداية ونهاية صحيحين، في فترة لا تتجاوز عشر سنوات.");
      return;
    }
    setNotice("");
    setBounds(next);
    setAppliedProgram(program);
  }
  return (
    <AppShell title="NCRs Management" subtitle="تحليل حالات عدم المطابقة من الأوديتات المعتمدة">
      <div className="space-y-5">
        <section className="surface-card p-4 sm:p-5" aria-label="فروع تحليل عدم المطابقة">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="size-5" />
              <h2 className="font-bold">اختار الفرع</h2>
              {branches.isSuccess && (
                <span className="text-sm text-muted-foreground">({branches.data.length})</span>
              )}
            </div>
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">بحث الفروع</span>
              <Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                placeholder="ابحث عن الفرع"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
              />
            </label>
          </div>
          {branches.isPending ? (
            <p role="status" className="mt-3">
              جارٍ تحميل الفروع…
            </p>
          ) : branches.isError ? (
            <div className="mt-3 space-y-2" role="alert">
              <p>{branches.error.message || "تعذر تحميل الفروع"}</p>
              <Button variant="outline" onClick={() => void branches.refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : visible.length ? (
            <div className="mt-4 grid max-h-52 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3 lg:grid-cols-5">
              {visible.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  aria-pressed={selected === branch.id}
                  className={cn(
                    "min-w-0 rounded-lg border px-3 py-2.5 text-start text-sm font-medium hover:bg-muted",
                    selected === branch.id && "border-primary bg-primary/10 text-primary",
                  )}
                  onClick={() => setSelected(branch.id)}
                >
                  {branch.name}
                  {!branch.active && (
                    <span className="block text-xs text-muted-foreground">فرع غير نشط</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {branchSearch ? "مفيش فرع مطابق للبحث." : "مفيش فروع متاحة لحسابك."}
            </p>
          )}
        </section>
        <form
          className="surface-card space-y-3 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            applyPeriod();
          }}
        >
          <h2 className="font-bold">الفترة ونوع الأوديت</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-sm">
              عرض الفترة
              <select
                className="h-9 rounded-md border bg-background px-2"
                aria-label="عرض الفترة"
                value={period}
                onChange={(e) => setPeriod(e.target.value as NcrPeriod)}
              >
                <option value="month">شهر</option>
                <option value="quarter">ربع سنة</option>
                <option value="year">سنة</option>
                <option value="custom">فترة محددة</option>
              </select>
            </label>
            {period === "custom" ? (
              <>
                <label className="grid gap-1.5 text-sm">
                  من{" "}
                  <Input
                    type="date"
                    dir="ltr"
                    value={custom.start}
                    onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  إلى{" "}
                  <Input
                    type="date"
                    dir="ltr"
                    value={custom.end}
                    onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                    required
                  />
                </label>
              </>
            ) : period === "month" ? (
              <label className="grid gap-1.5 text-sm">
                الشهر
                <Input
                  type="month"
                  dir="ltr"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  required
                />
              </label>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm">
                  السنة
                  <select
                    aria-label="السنة"
                    className="h-9 rounded-md border bg-background px-2"
                    value={selectedYear || currentYear}
                    onChange={(event) =>
                      setAnchor(event.target.value + "-" + (anchor.slice(5) || "01"))
                    }
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                {period === "quarter" && (
                  <label className="grid gap-1.5 text-sm">
                    الربع
                    <select
                      aria-label="الربع"
                      className="h-9 rounded-md border bg-background px-2"
                      value={selectedQuarter}
                      onChange={(event) =>
                        setAnchor(
                          (selectedYear || String(currentYear)) +
                            "-" +
                            String((Number(event.target.value) - 1) * 3 + 1).padStart(2, "0"),
                        )
                      }
                    >
                      {["الأول", "الثاني", "الثالث", "الرابع"].map((label, index) => (
                        <option key={label} value={index + 1}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            <label className="grid gap-1.5 text-sm">
              نوع الأوديت
              <select
                className="h-9 rounded-md border bg-background px-2"
                aria-label="نوع الأوديت"
                value={program}
                onChange={(e) => setProgram(ncrProgram.parse(e.target.value))}
              >
                <option value="both">FS + GHP</option>
                <option value="FS">FS فقط</option>
                <option value="GHP">GHP فقط</option>
              </select>
            </label>
            <Button type="submit" size="sm">
              تطبيق الفلتر
            </Button>
          </div>
          {notice && (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          )}
        </form>
        {!selected ? (
          <div className="surface-card flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <ListChecks className="size-5" /> اختار فرع عشان تشوف التحليل والبنود المتكررة.
          </div>
        ) : report.isError ? (
          <div className="surface-card space-y-2 p-5" role="alert">
            <p>{report.error.message || "تعذر تجهيز تحليل الفرع"}</p>
            <Button variant="outline" onClick={() => void report.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : analysis && filters ? (
          <NcrAnalysisView
            key={JSON.stringify(filters)}
            analysis={analysis}
            filters={filters}
            refresh={() => void report.refetch()}
          />
        ) : (
          <p className="surface-card p-5" role="status">
            {branches.isSuccess && !branches.data.some((b) => b.id === selected)
              ? "الفرع غير متاح لحسابك."
              : "جارٍ تحليل الأوديتات المعتمدة…"}
          </p>
        )}
      </div>
    </AppShell>
  );
}

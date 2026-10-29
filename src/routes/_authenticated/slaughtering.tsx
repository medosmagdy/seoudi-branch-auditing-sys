import {
  addSlaughterLocation,
  loadSlaughterLocations,
  slaughterLocationOptions,
  type SlaughterLocationKind,
} from "@/lib/slaughter-locations";
import { attachSlaughterImages, photoForExcel } from "@/lib/slaughter-images";
import { SlaughterForm } from "@/components/slaughter/SlaughterForm";
import { SlaughterDailyReport } from "@/components/slaughter/SlaughterDailyReport";
import { SlaughterAnalytics } from "@/components/slaughter/SlaughterAnalytics";
import {
  reportFromSlaughterRow,
  slaughterView,
  slaughterNameKey,
  slaughterAnimalType,
  type SlaughterReport,
} from "@/lib/slaughter-model";
import { buildSlaughterWorkbook, buildDailySlaughterWorkbook } from "@/lib/slaughter-export";
import { loadSlaughterReports, saveSlaughterReport } from "@/lib/slaughter-data";
import {
  rejectionSummary,
  slaughterPercent,
  validateSlaughterDraft,
  type SlaughterDetails,
  type SlaughterDraft,
} from "@/lib/slaughter-report";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { writeFile } from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import slaughterArchive from "@/data/slaughter-archive.json";
import {
  CalendarDays,
  ClipboardCheck,
  Download,
  ImagePlus,
  Plus,
  Search,
  Scale,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/slaughtering")({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw new Error("Unauthorized");
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleData?.role !== "admin") {
      throw redirect({ to: "/dashboard", search: { scope: "branches" } });
    }
  },
  component: SlaughteringPage,
});

type Report = SlaughterReport;

const reports: Report[] = slaughterArchive as Report[];

const animalTypes = ["Bulls", "Sheep", "Goats", "Buffalo"];
const normalizeAnimalType = (value: string) =>
  value.trim().toLowerCase() === "goat"
    ? "Goats"
    : value.trim().toLowerCase() === "sheep"
      ? "Sheep"
      : value.trim().toLowerCase() === "bulls"
        ? "Bulls"
        : value.trim().toLowerCase() === "baffalo"
          ? "Buffalo"
          : value;
const rejectionReasons = ["Carcass", "Live", "Parasitic", "Viral", "TB", "Managemental"];

function SlaughteringPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reportSource, setReportSource] = useState("أرشيف محلي");
  const [query, setQuery] = useState("");
  const [animalType, setAnimalType] = useState("all");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [farmFilter, setFarmFilter] = useState("all");
  const [houseFilter, setHouseFilter] = useState("all");
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [reportDate, setReportDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()),
  );
  const [message, setMessage] = useState("");
  const [savedReports, setSavedReports] = useState<Report[]>(reports);
  const [sourceChoice, setSourceChoice] = useState("current");
  const sourceReports = sourceChoice === "archive" ? reports : savedReports;
  const exportSource =
    sourceChoice === "archive" || reportSource !== "قاعدة البيانات"
      ? "التقارير القديمة"
      : "التقارير المسجلة على النظام";
  const [gallery, setGallery] = useState<Array<{ url: string; name: string }>>([]);
  const [farms, setFarms] = useState<string[]>([
    ...new Set(reports.map((report) => report.farm).filter(Boolean)),
  ]);
  const [slaughterhouses, setSlaughterhouses] = useState<string[]>([
    ...new Set(reports.map((report) => report.slaughterhouse).filter(Boolean)),
  ]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  useEffect(() => {
    let active = true;
    setReportsLoading(true);
    setReportsError(false);
    void (async () => {
      let data;
      try {
        data = await loadSlaughterReports();
      } catch (error) {
        if (active) setReportsError(true);
        if (active)
          setMessage(
            `تعذر تحميل التقارير المسجلة؛ المعروض التقارير القديمة فقط: ${error instanceof Error ? error.message : ((error as { message?: string })?.message ?? "خطأ غير معروف")}`,
          );
        return;
      } finally {
        if (active) setReportsLoading(false);
      }
      if (!active) return;
      if (!data?.length) {
        setMessage("لا توجد تقارير مسجلة على النظام حتى الآن؛ المعروض التقارير القديمة فقط");
        return;
      }
      setMessage("");
      setReportSource("قاعدة البيانات");
      setSavedReports(data.map(reportFromSlaughterRow));
    })();
    void (async () => {
      try {
        const { data: photos } = await (supabase as any)
          .from("slaughter_report_photos")
          .select("storage_path, file_name")
          .order("created_at", { ascending: false })
          .limit(12);
        if (active && photos) {
          const signed = await Promise.all(
            photos.map(async (photo: { storage_path: string; file_name: string }) => {
              const result = await supabase.storage
                .from("audit-reports")
                .createSignedUrl(photo.storage_path, 3600);
              return result.data?.signedUrl
                ? { url: result.data.signedUrl, name: photo.file_name }
                : null;
            }),
          );
          if (!active) return;
          setGallery(signed.filter((item): item is { url: string; name: string } => Boolean(item)));
        }
      } catch {
        /* Report browsing remains available when gallery loading fails. */
      }
    })();
    void (async () => {
      try {
        const locations = await loadSlaughterLocations();
        if (!active) return;
        setFarms((current) =>
          slaughterLocationOptions([
            ...current,
            ...locations.filter((item) => item.kind === "farm").map((item) => item.name),
          ]),
        );
        setSlaughterhouses((current) =>
          slaughterLocationOptions([
            ...current,
            ...locations.filter((item) => item.kind === "slaughterhouse").map((item) => item.name),
          ]),
        );
      } catch {
        /* Existing report names remain selectable; creation surfaces any persistence error. */
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filteredReports = useMemo(
    () =>
      [...sourceReports]
        .filter((report) => {
          const matchesQuery = [report.farm, report.slaughterhouse, report.animalType]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase());
          const matchesType =
            animalType === "all" || slaughterAnimalType(report.animalType) === animalType;
          return (
            matchesQuery &&
            matchesType &&
            (!month || report.date.startsWith(month)) &&
            (!year || report.date.startsWith(year)) &&
            (farmFilter === "all" ||
              slaughterNameKey(report.farm) === slaughterNameKey(farmFilter)) &&
            (houseFilter === "all" ||
              slaughterNameKey(report.slaughterhouse) === slaughterNameKey(houseFilter)) &&
            (seasonFilter === "all" || slaughterView(report).season === seasonFilter)
          );
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [animalType, month, query, sourceReports, year, farmFilter, houseFilter, seasonFilter],
  );

  const addLocation = async (kind: SlaughterLocationKind, value: string): Promise<string> => {
    const saved = await addSlaughterLocation(kind, value);
    const setter = kind === "farm" ? setFarms : setSlaughterhouses;
    setter((current) => slaughterLocationOptions([...current, saved]));
    return saved;
  };

  const saveReport = async (draft: SlaughterDraft) => {
    const validation = validateSlaughterDraft(draft);
    if (validation) {
      notify(validation);
      return false;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      notify("يجب تسجيل الدخول قبل حفظ التقرير");
      return false;
    }
    const { data, error } = await saveSlaughterReport(
      {
        report_date: draft.date,
        farm_name: draft.farm,
        slaughterhouse_name: draft.slaughterhouse,
        animal_type: draft.animalType,
        total_count: draft.number,
        received_count: draft.received,
        carcass_weight: draft.carcassWeight,
        report_details: draft.details,
        rejection_reason: draft.rejectionReason || null,
        accepted_exception: draft.acceptedException,
        status: "draft",
        created_by: userData.user.id,
      },
      draft.id,
    );
    if (error) {
      notify(`تعذر حفظ التقرير: ${error.message}`);
      return false;
    }
    let attachmentWarning = "";
    if (draft.photos.length) {
      const uploads = await Promise.all(
        draft.photos.map(async (file) => {
          const path = `slaughter/${data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
          const upload = await supabase.storage
            .from("audit-reports")
            .upload(path, file, { contentType: file.type, upsert: false });
          return upload.error ? { error: upload.error } : { path, fileName: file.name };
        }),
      );
      const failed = uploads.find((item) => item.error);
      if (failed?.error) {
        attachmentWarning = "تعذر رفع بعض الصور";
      }
      {
        const photoRows = uploads.flatMap((item) =>
          "path" in item && "fileName" in item
            ? [
                {
                  report_id: data.id,
                  storage_path: item.path,
                  file_name: item.fileName,
                  created_by: userData.user.id,
                },
              ]
            : [],
        );
        if (photoRows.length) {
          const { error: photoError } = await (supabase as any)
            .from("slaughter_report_photos")
            .insert(photoRows);
          if (photoError) attachmentWarning = "تعذر ربط بعض الصور بالتقرير";
        }
      }
    }
    setReportSource("قاعدة البيانات");
    setSourceChoice("current");
    setSavedReports((current) => [
      reportFromSlaughterRow({ ...data, report_details: data.report_details ?? draft.details }),
      ...current.filter(
        (report) =>
          !String(report.id).startsWith("archive-") && String(report.id) !== String(data.id),
      ),
    ]);
    notify(
      attachmentWarning
        ? `تم حفظ التقرير كمسودة، لكن ${attachmentWarning}`
        : "تم حفظ التقرير كمسودة بنجاح",
    );
    setActiveTab("reports");
    setEditingReport(null);
    return true;
  };

  const [exportingDaily, setExportingDaily] = useState(false);
  const exportReport = async (report: Report) => {
    if (exportingDaily) return;
    setExportingDaily(true);
    try {
      const images = [];
      if (!String(report.id).startsWith("archive-")) {
        const { data, error } = await (supabase as any)
          .from("slaughter_report_photos")
          .select("storage_path,file_name")
          .eq("report_id", report.id)
          .order("created_at");
        if (error) throw error;
        for (const photo of data ?? []) {
          const signed = await supabase.storage
            .from("audit-reports")
            .createSignedUrl(photo.storage_path, 3600);
          if (signed.error) throw signed.error;
          const response = await fetch(signed.data.signedUrl);
          if (!response.ok) throw new Error("تعذر تحميل إحدى صور التقرير؛ لم يُصدّر ملف ناقص");
          images.push(await photoForExcel(await response.blob()));
        }
      }
      const bytes = await attachSlaughterImages(buildDailySlaughterWorkbook(report), images);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `slaughter-daily-${report.date}-${report.id}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("تم تجهيز التقرير اليومي بكل التفاصيل المتاحة والصور المرتبطة به");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تصدير التقرير اليومي");
    } finally {
      setExportingDaily(false);
    }
  };
  const exportFilteredReports = () => {
    try {
      const workbook = buildSlaughterWorkbook(filteredReports, {
        month,
        animalType,
        query,
        source: exportSource,
        year,
        farm: farmFilter,
        slaughterhouse: houseFilter,
        season: seasonFilter,
      });
      writeFile(workbook, `slaughter-reports-${month || "all"}.xlsx`, { compression: true });
      notify(`تم تجهيز ملف Excel لعدد ${filteredReports.length} تقرير`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تجهيز ملف التصدير");
    }
  };

  const reasonCounts = rejectionSummary(filteredReports, rejectionReasons);

  const totalNumber = filteredReports.reduce((sum, report) => sum + report.number, 0);
  const totalReceived = filteredReports.reduce((sum, report) => sum + report.received, 0);
  const totalRejected = filteredReports.reduce((sum, report) => sum + report.rejected, 0);
  const acceptance = totalNumber ? Math.round((totalReceived / totalNumber) * 100) : 0;

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
  };

  return (
    <AppShell
      contentClassName="slaughter-page"
      title="المجازر"
      subtitle="تسجيل ومتابعة تقارير الذبح اليومية والتقييم الصحي للحوم"
      action={
        <Button
          onClick={() => {
            setEditingReport(null);
            setActiveTab("new");
          }}
        >
          <Plus className="ml-2 size-4" /> تقرير يومي جديد
        </Button>
      }
    >
      {message && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          {message}
          {reportsError && (
            <Button
              variant="outline"
              size="sm"
              className="ms-3"
              disabled={reportsLoading}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              إعادة تحميل التقارير
            </Button>
          )}
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="mb-5 grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="reports">التقارير اليومية</TabsTrigger>
          <TabsTrigger value="new">تقرير جديد</TabsTrigger>
        </TabsList>

        {activeTab !== "new" && (
          <div
            className="mb-4 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4"
            dir="rtl"
          >
            <label className="text-xs">
              عرض التقارير
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={sourceChoice}
                disabled={reportsLoading}
                onChange={(e) => {
                  setSourceChoice(e.target.value);
                  setFarmFilter("all");
                  setHouseFilter("all");
                  setYear("");
                  setMonth("");
                  setSeasonFilter("all");
                  setAnimalType("all");
                  setQuery("");
                }}
              >
                <option value="current">
                  {reportsLoading
                    ? "جاري تحميل التقارير…"
                    : reportSource === "قاعدة البيانات"
                      ? "التقارير المسجلة على النظام"
                      : "التقارير القديمة"}
                </option>
                {reportSource === "قاعدة البيانات" && (
                  <option value="archive">التقارير القديمة</option>
                )}
              </select>
            </label>
            <label className="text-xs">
              المزرعة
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={farmFilter}
                onChange={(e) => setFarmFilter(e.target.value)}
              >
                <option value="all">كل المزارع</option>
                {[...new Map(sourceReports.map((r) => [slaughterNameKey(r.farm), r.farm])).values()]
                  .sort()
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </label>
            <label className="text-xs">
              المجزر
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={houseFilter}
                onChange={(e) => setHouseFilter(e.target.value)}
              >
                <option value="all">كل المجازر</option>
                {[
                  ...new Map(
                    sourceReports.map((r) => [
                      slaughterNameKey(r.slaughterhouse),
                      r.slaughterhouse,
                    ]),
                  ).values(),
                ]
                  .filter(Boolean)
                  .sort()
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </label>
            <label className="text-xs">
              السنة
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">كل السنوات</option>
                {[...new Set(sourceReports.map((r) => r.date.slice(0, 4)))]
                  .sort()
                  .reverse()
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
            <label className="text-xs">
              الموسم
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
              >
                <option value="all">كل المواسم</option>
                {["Normal", "Ramadan", "Adha Season"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              الشهر
              <Input
                className="mt-1 h-10"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label className="text-xs">
              نوع الحيوان
              <select
                className="mt-1 h-10 w-full rounded border bg-background px-2"
                value={animalType}
                onChange={(e) => setAnimalType(e.target.value)}
              >
                <option value="all">كل الأنواع</option>
                {animalTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              بحث داخل التقارير
              <Input
                className="mt-1 h-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="المزرعة أو المجزر أو النوع"
              />
            </label>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setYear("");
                setMonth("");
                setFarmFilter("all");
                setHouseFilter("all");
                setSeasonFilter("all");
                setAnimalType("all");
                setQuery("");
              }}
            >
              مسح كل الفلاتر
            </Button>
          </div>
        )}
        {year && month && !month.startsWith(year) && activeTab !== "new" && (
          <p className="mb-3 text-sm text-destructive">
            الشهر خارج السنة المختارة؛ راجع محددات الفترة.
          </p>
        )}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="إجمالي الحيوانات"
              value={totalNumber.toLocaleString("en-US")}
              detail="حسب الفترة المحددة"
              icon={ClipboardCheck}
            />
            <MetricCard
              title="المستلم"
              value={totalReceived.toLocaleString("en-US")}
              detail={`${acceptance}% نسبة القبول`}
              icon={Scale}
            />
            <MetricCard
              title="المرفوض"
              value={totalRejected.toLocaleString("en-US")}
              detail="مع تسجيل سبب الرفض"
              icon={XCircle}
            />
            <MetricCard
              title="وزن الذبائح"
              value={
                filteredReports.some((report) => slaughterView(report).carcassWeight === null)
                  ? "بيانات غير مكتملة"
                  : `${Math.round(filteredReports.reduce((sum, report) => sum + (slaughterView(report).carcassWeight ?? 0), 0) / 1000)} طن`
              }
              detail="إجمالي الوزن؛ القيم غير المسجلة لا تُعامل كصفر"
              icon={Scale}
            />
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Grand Total</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">ملخص المجازر للفترة المحددة</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={reportsLoading || !filteredReports.length}
                onClick={exportFilteredReports}
              >
                <Download className="ml-2 size-4" /> تصدير
              </Button>
            </CardHeader>
            <CardContent>
              <Progress value={acceptance} className="h-3" />
              <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                <span>نسبة القبول</span>
                <span>{acceptance}%</span>
              </div>
            </CardContent>
          </Card>
          {gallery.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>معرض الصور الأخير</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {gallery.map((photo) => (
                  <ImageLightbox
                    key={photo.url}
                    src={photo.url}
                    alt={photo.name}
                    className="aspect-square w-full"
                    imageClassName="aspect-square w-full rounded-lg border object-cover"
                  />
                ))}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>التراكمي حسب النوع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {animalTypes.map((type) => {
                  const count = filteredReports
                    .filter((report) => slaughterAnimalType(report.animalType) === type)
                    .reduce((sum, report) => sum + report.number, 0);
                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between rounded-lg bg-muted/40 p-3"
                    >
                      <span>{type}</span>
                      <Badge variant="secondary">{count.toLocaleString("en-US")}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>أسباب الرفض — عدد التقارير في الفترة المختارة</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {Object.entries(reasonCounts)
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => (
                    <div key={reason} className="rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground">{reason}</p>
                      <p className="mt-1 text-xl font-bold">{count.toLocaleString("en-US")}</p>
                    </div>
                  ))}
                {Object.values(reasonCounts).every((count) => count === 0) && (
                  <p className="col-span-2 text-sm text-muted-foreground">
                    لا توجد أسباب رفض مسجلة.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
          <SlaughterAnalytics reports={filteredReports} />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{filteredReports.length} تقرير ضمن الفلاتر المختارة</p>
            <Button
              variant="outline"
              disabled={reportsLoading || !filteredReports.length}
              onClick={exportFilteredReports}
            >
              تصدير النتائج Excel
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      {[
                        "التاريخ",
                        "المزرعة",
                        "المجزر",
                        "النوع",
                        "العدد",
                        "المستلم",
                        "المرفوض",
                        "التقييم",
                        "الحالة",
                      ].map((heading) => (
                        <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => (
                      <tr
                        key={report.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/20"
                        onClick={() => setSelectedReport(report)}
                      >
                        <td className="whitespace-nowrap px-4 py-3">{report.date}</td>
                        <td className="px-4 py-3 font-medium">{report.farm}</td>
                        <td className="px-4 py-3">{report.slaughterhouse}</td>
                        <td className="px-4 py-3">{report.animalType}</td>
                        <td className="px-4 py-3">{report.number}</td>
                        <td className="px-4 py-3">{report.received}</td>
                        <td className="px-4 py-3 text-destructive">{report.rejected}</td>
                        <td className="px-4 py-3">
                          {slaughterPercent(slaughterView(report).score, "percentage")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={report.status === "مكتمل" ? "default" : "secondary"}>
                              {report.status}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="تصدير Excel"
                              onClick={(event) => {
                                event.stopPropagation();
                                exportReport(report);
                              }}
                            >
                              <Download className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredReports.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد تقارير مطابقة للفلاتر.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          {editingReport && (
            <p className="mb-3 rounded border p-3 text-sm">
              استكمال مسودة {editingReport.farm} — {editingReport.date}
            </p>
          )}
          <SlaughterForm
            key={editingReport?.id ?? "new"}
            initial={editingReport}
            date={reportDate}
            onDate={setReportDate}
            onSave={saveReport}
            notify={notify}
            farms={slaughterLocationOptions([
              ...farms,
              ...savedReports.map((report) => report.farm),
            ])}
            houses={slaughterLocationOptions([
              ...slaughterhouses,
              ...savedReports.map((report) => report.slaughterhouse),
            ])}
            onCreateLocation={addLocation}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={Boolean(selectedReport)}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto" dir="rtl">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle>تفاصيل تقرير الذبح — {selectedReport.date}</DialogTitle>
                {selectedReport.details?.version === 2 && selectedReport.status === "مسودة" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingReport(selectedReport);
                      setReportDate(selectedReport.date);
                      setSelectedReport(null);
                      setActiveTab("new");
                    }}
                  >
                    استكمال / تعديل المسودة
                  </Button>
                )}
              </DialogHeader>
              <SlaughterDailyReport
                key={selectedReport.id}
                report={selectedReport}
                onExcel={() => void exportReport(selectedReport)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Scale;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SlaughteringPage;

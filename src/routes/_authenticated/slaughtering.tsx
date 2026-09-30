import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import slaughterArchive from "@/data/slaughter-archive.json";
import { CalendarDays, ClipboardCheck, Download, ImagePlus, Plus, Search, Scale, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/slaughtering")({
  component: SlaughteringPage,
});

type Report = {
  id: string | number;
  date: string;
  farm: string;
  slaughterhouse: string;
  animalType: string;
  number: number;
  received: number;
  rejected: number;
  carcassWeight: number;
  meatScore: number;
  status: "مكتمل" | "مسودة" | "معتمد";
};

const reports: Report[] = slaughterArchive as Report[];

const animalTypes = ["Bulls", "Native breed bulls", "Sheep", "Buffalo"];
const rejectionReasons = ["Carcass", "Live", "Parasitic", "Viral", "TB", "Managemental"];

function SlaughteringPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [animalType, setAnimalType] = useState("all");
  const [month, setMonth] = useState("");
  const [reportDate, setReportDate] = useState("2026-09-14");
  const [message, setMessage] = useState("");
  const [savedReports, setSavedReports] = useState<Report[]>(reports);
  const [reasonCounts, setReasonCounts] = useState<Record<string, number>>({});
  const [gallery, setGallery] = useState<Array<{ url: string; name: string }>>([]);
  const [farms, setFarms] = useState<string[]>([...new Set(reports.map((report) => report.farm).filter(Boolean))]);
  const [slaughterhouses, setSlaughterhouses] = useState<string[]>([...new Set(reports.map((report) => report.slaughterhouse).filter(Boolean))]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("slaughter_reports")
        .select("id, report_date, farm_name, slaughterhouse_name, animal_type, total_count, received_count, rejected_count, carcass_weight, meat_score, status")
        .order("report_date", { ascending: false });
      if (!active || error || !data?.length) return;
      setSavedReports(data.map((item: any) => ({
        id: item.id,
        date: item.report_date,
        farm: item.farm_name,
        slaughterhouse: item.slaughterhouse_name,
        animalType: item.animal_type,
        number: item.total_count,
        received: item.received_count,
        rejected: item.rejected_count,
        carcassWeight: Number(item.carcass_weight),
        meatScore: Number(item.meat_score ?? 0),
        status: item.status === "draft" ? "مسودة" : item.status === "approved" ? "معتمد" : "مكتمل",
      })));
    })();
    void (async () => {
      const { data: reasons } = await (supabase as any).from("slaughter_reports").select("rejection_reason").not("rejection_reason", "is", null);
      if (active && reasons) {
        setReasonCounts(reasons.reduce((counts: Record<string, number>, item: { rejection_reason: string }) => ({ ...counts, [item.rejection_reason]: (counts[item.rejection_reason] ?? 0) + 1 }), {}));
      }
      const { data: photos } = await (supabase as any).from("slaughter_report_photos").select("storage_path, file_name").order("created_at", { ascending: false }).limit(12);
      if (active && photos) {
        const signed = await Promise.all(photos.map(async (photo: { storage_path: string; file_name: string }) => {
          const result = await supabase.storage.from("audit-reports").createSignedUrl(photo.storage_path, 3600);
          return result.data?.signedUrl ? { url: result.data.signedUrl, name: photo.file_name } : null;
        }));
        setGallery(signed.filter((item): item is { url: string; name: string } => Boolean(item)));
      }
    })();
    return () => { active = false; };
  }, []);

  const filteredReports = useMemo(() => savedReports.filter((report) => {
    const matchesQuery = [report.farm, report.slaughterhouse, report.animalType].join(" ").toLowerCase().includes(query.toLowerCase());
    const matchesType = animalType === "all" || report.animalType === animalType;
    return matchesQuery && matchesType && (!month || report.date.startsWith(month));
  }), [animalType, month, query, savedReports]);

  const addLocation = async (kind: "farm" | "slaughterhouse", value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const setter = kind === "farm" ? setFarms : setSlaughterhouses;
    setter((current) => current.includes(clean) ? current : [...current, clean].sort());
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) await (supabase as any).from("slaughter_locations").upsert({ kind, name: clean, created_by: userData.user.id }, { onConflict: "kind,name" });
  };

  const saveReport = async (draft: {
    date: string;
    farm: string;
    slaughterhouse: string;
    animalType: string;
    number: number;
    received: number;
    carcassWeight: number;
    meatScore: number;
    amScore: number | null;
    pmScore: number | null;
    rejectionReason: string;
    photos: File[];
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      notify("يجب تسجيل الدخول قبل حفظ التقرير");
      return false;
    }
    const { data, error } = await (supabase as any)
      .from("slaughter_reports")
      .insert({
        report_date: draft.date,
        farm_name: draft.farm,
        slaughterhouse_name: draft.slaughterhouse,
        animal_type: draft.animalType,
        total_count: draft.number,
        received_count: draft.received,
        carcass_weight: draft.carcassWeight,
        am_score: draft.amScore,
        pm_score: draft.pmScore,
        rejection_reason: draft.rejectionReason || null,
        status: "draft",
        created_by: userData.user.id,
      })
      .select("id, report_date, farm_name, slaughterhouse_name, animal_type, total_count, received_count, rejected_count, carcass_weight, meat_score, status")
      .single();
    if (error) {
      notify(`تعذر حفظ التقرير: ${error.message}`);
      return false;
    }
    if (draft.photos.length) {
      const uploads = await Promise.all(draft.photos.map(async (file) => {
        const path = `slaughter/${data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const upload = await supabase.storage.from("audit-reports").upload(path, file, { contentType: file.type, upsert: false });
        return upload.error ? { error: upload.error } : { path, fileName: file.name };
      }));
      const failed = uploads.find((item) => item.error);
      if (failed?.error) {
        notify("تم حفظ التقرير لكن تعذر رفع بعض الصور");
      } else {
        const photoRows = uploads.flatMap((item) =>
          "path" in item && "fileName" in item
            ? [{ report_id: data.id, storage_path: item.path, file_name: item.fileName, created_by: userData.user.id }]
            : [],
        );
        if (photoRows.length) {
          await (supabase as any).from("slaughter_report_photos").insert(photoRows);
        }
      }
    }
    setSavedReports((current) => [{
      id: data.id,
      date: data.report_date,
      farm: data.farm_name,
      slaughterhouse: data.slaughterhouse_name,
      animalType: data.animal_type,
      number: data.total_count,
      received: data.received_count,
      rejected: data.rejected_count,
      carcassWeight: Number(data.carcass_weight),
      meatScore: Number(data.meat_score ?? draft.meatScore),
      status: "مسودة",
    }, ...current]);
    notify("تم حفظ التقرير كمسودة بنجاح");
    setActiveTab("reports");
    return true;
  };

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
      title="المجازر"
      subtitle="تسجيل ومتابعة تقارير الذبح اليومية والتقييم الصحي للحوم"
      action={<Button onClick={() => setActiveTab("new")}><Plus className="ml-2 size-4" /> تقرير يومي جديد</Button>}
    >
      {message && <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">{message}</div>}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="mb-5 grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="reports">التقارير اليومية</TabsTrigger>
          <TabsTrigger value="new">تقرير جديد</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="إجمالي الحيوانات" value={totalNumber.toLocaleString("en-US")} detail="حسب الفترة المحددة" icon={ClipboardCheck} />
            <MetricCard title="المستلم" value={totalReceived.toLocaleString("en-US")} detail={`${acceptance}% نسبة القبول`} icon={Scale} />
            <MetricCard title="المرفوض" value={totalRejected.toLocaleString("en-US")} detail="مع تسجيل سبب الرفض" icon={XCircle} />
            <MetricCard title="وزن الذبائح" value={`${Math.round(filteredReports.reduce((sum, report) => sum + report.carcassWeight, 0) / 1000)} طن`} detail="إجمالي الوزن المسجل" icon={Scale} />
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div><CardTitle>Grand Total</CardTitle><p className="mt-1 text-sm text-muted-foreground">ملخص المجازر للفترة المحددة</p></div>
              <Button variant="outline" size="sm" onClick={() => notify("سيتم تجهيز ملف التصدير بعد ربط البيانات") }><Download className="ml-2 size-4" /> تصدير</Button>
            </CardHeader>
            <CardContent><Progress value={acceptance} className="h-3" /><div className="mt-3 flex justify-between text-sm text-muted-foreground"><span>نسبة القبول</span><span>{acceptance}%</span></div></CardContent>
          </Card>
          {gallery.length > 0 && <Card><CardHeader><CardTitle>معرض الصور الأخير</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">{gallery.map((photo) => <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name} className="aspect-square w-full rounded-lg border object-cover transition-opacity hover:opacity-80" /></a>)}</CardContent></Card>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>التراكمي حسب النوع</CardTitle></CardHeader><CardContent className="space-y-4">{animalTypes.map((type) => { const count = filteredReports.filter((report) => report.animalType === type).reduce((sum, report) => sum + report.number, 0); return <div key={type} className="flex items-center justify-between rounded-lg bg-muted/40 p-3"><span>{type}</span><Badge variant="secondary">{count.toLocaleString("en-US")}</Badge></div>; })}</CardContent></Card>
            <Card><CardHeader><CardTitle>أسباب الرفض</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{rejectionReasons.map((reason) => <div key={reason} className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">{reason}</p><p className="mt-1 text-xl font-bold">{reasonCounts[reason] ?? 0}</p></div>)}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" placeholder="ابحث بالمزرعة أو المجزر أو النوع" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select value={animalType} onValueChange={setAnimalType}><SelectTrigger className="w-full md:w-48"><SelectValue placeholder="نوع الحيوان" /></SelectTrigger><SelectContent><SelectItem value="all">كل الأنواع</SelectItem>{animalTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Input className="w-full md:w-40" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></CardContent></Card>
          <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="border-b bg-muted/40"><tr>{["التاريخ", "المزرعة", "المجزر", "النوع", "العدد", "المستلم", "الم��فوض", "التقييم", "الحالة"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{filteredReports.map((report) => <tr key={report.id} className="border-b last:border-0 hover:bg-muted/20"><td className="whitespace-nowrap px-4 py-3">{report.date}</td><td className="px-4 py-3 font-medium">{report.farm}</td><td className="px-4 py-3">{report.slaughterhouse}</td><td className="px-4 py-3">{report.animalType}</td><td className="px-4 py-3">{report.number}</td><td className="px-4 py-3">{report.received}</td><td className="px-4 py-3 text-destructive">{report.rejected}</td><td className="px-4 py-3">{report.meatScore}%</td><td className="px-4 py-3"><Badge variant={report.status === "مكتمل" ? "default" : "secondary"}>{report.status}</Badge></td></tr>)}</tbody></table></div>{filteredReports.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">لا توجد تقارير مطابقة للفلاتر.</div>}</CardContent></Card>
        </TabsContent>

        <TabsContent value="new"><DailyReportForm reportDate={reportDate} setReportDate={setReportDate} notify={notify} onSave={saveReport} farms={farms} slaughterhouses={slaughterhouses} addLocation={addLocation} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function MetricCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Scale }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="size-5" /></div></div></CardContent></Card>;
}

const checklistSections = [
  { title: "1. Ante-mortem examination", rows: [{ label: "Rough handling", total: 5 }, { label: "Over capacity", total: 5 }, { label: "Animal identification", total: 1 }, { label: "Age", total: 5 }, { label: "Animals hygienic conditions", total: 3 }, { label: "General health condition", total: 1 }, { label: "Lymph nodes", total: 1 }, { label: "Skin diseases", total: 1 }, { label: "External parasites", total: 1 }, { label: "Body condition scores", total: 2 }] },
  { title: "2. Slaughterhouse hygienic condition", rows: [{ label: "Facilities", total: 1 }, { label: "Tools", total: 2 }, { label: "Employee", total: 2 }] },
  { title: "3. Post-mortem examination", rows: [{ label: "Proper killing", total: 3 }, { label: "Completely dead before cutting spinal cord", total: 3 }, { label: "Bleeding", total: 5 }, { label: "Flaying process", total: 1 }, { label: "Bruises", total: 5 }, { label: "Urinary bladder", total: 1 }, { label: "Intestine", total: 1 }, { label: "Rumen", total: 2 }, { label: "Gall bladder", total: 1 }, { label: "Examination of carcass L.N.", total: 5 }, { label: "Examination of head", total: 1 }, { label: "Lung", total: 2 }, { label: "Liver", total: 2 }, { label: "Kidney", total: 2 }, { label: "Heart", total: 2 }, { label: "Jaundice", total: 3 }, { label: "Contamination", total: 5 }, { label: "Condemnation", total: 5 }, { label: "Stamp", total: 1 }] },
  { title: "4. Meat quality score", rows: [{ label: "Meat Color", total: 5 }, { label: "Fat color", total: 3 }, { label: "Marbling", total: 1 }, { label: "Firmness", total: 1 }] },
  { title: "5. Meat transportation", rows: [{ label: "Cleaning and sanitation", total: 3 }, { label: "Proper food grade packaging material", total: 3 }, { label: "Cooling", total: 2 }, { label: "Capacity", total: 2 }] },
];

function DailyReportForm({ reportDate, setReportDate, notify, onSave, farms, slaughterhouses, addLocation }: { reportDate: string; setReportDate: (value: string) => void; notify: (text: string) => void; farms: string[]; slaughterhouses: string[]; addLocation: (kind: "farm" | "slaughterhouse", value: string) => Promise<void>; onSave: (draft: { date: string; farm: string; slaughterhouse: string; animalType: string; number: number; received: number; carcassWeight: number; meatScore: number; amScore: number | null; pmScore: number | null; rejectionReason: string; photos: File[] }) => Promise<boolean> }) {
  const [farm, setFarm] = useState("");
  const [slaughterhouse, setSlaughterhouse] = useState("");
  const [animalType, setAnimalType] = useState(animalTypes[0]);
  const [number, setNumber] = useState("");
  const [received, setReceived] = useState("");
  const [carcassWeight, setCarcassWeight] = useState("");
  const [farmWeight, setFarmWeight] = useState("");
  const [receivingWeight, setReceivingWeight] = useState("");
  const [fatWeight, setFatWeight] = useState("");
  const [tripDuration, setTripDuration] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [nonconformities, setNonconformities] = useState<Record<string, string>>({});
  const [amScore, setAmScore] = useState("");
  const [pmScore, setPmScore] = useState("");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const rejected = Math.max(0, Number(number || 0) - Number(received || 0));
  const checklistTotal = checklistSections.reduce((sum, section) => sum + section.rows.reduce((sectionSum, row) => sectionSum + row.total, 0), 0);
  const checklistDegree = checklistSections.reduce((sum, section) => sum + section.rows.reduce((sectionSum, row) => sectionSum + row.total * Math.max(0, 1 - Number(nonconformities[row.label] || 0) / Math.max(1, Number(received || 0))), 0), 0);
  const checklistScore = checklistTotal ? (checklistDegree / checklistTotal) * 100 : 0;
  const meatScore = amScore && pmScore ? Math.round((Number(amScore) + Number(pmScore)) / 2) : 0;

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("slaughter_suggestions").select("item_key, suggestion").eq("is_active", true);
      if (data) setSuggestions(data.reduce((result: Record<string, string[]>, item: { item_key: string; suggestion: string }) => ({ ...result, [item.item_key]: [...(result[item.item_key] ?? []), item.suggestion] }), {}));
    })();
  }, []);

  const rememberNote = async (itemKey: string, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setSuggestions((current) => ({ ...current, [itemKey]: [...new Set([...(current[itemKey] ?? []), clean])] }));
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) await (supabase as any).from("slaughter_suggestions").upsert({ item_key: itemKey, suggestion: clean, created_by: userData.user.id }, { onConflict: "item_key,suggestion" });
  };

  const saveDraft = () => {
    if (!reportDate || !farm || !slaughterhouse || !number || !received) {
      notify("أكمل التاريخ والمزرعة والمجزر والعدد والمستلم أولًا");
      return;
    }
    if (Number(received) > Number(number)) {
      notify("عدد المستلم لا يمكن أن يتجاوز العدد الكلي");
      return;
    }
    void onSave({
      date: reportDate,
      farm,
      slaughterhouse,
      animalType,
      number: Number(number),
      received: Number(received),
      carcassWeight: Number(carcassWeight || 0),
      meatScore,
      amScore: amScore ? Number(amScore) : null,
      pmScore: pmScore ? Number(pmScore) : null,
      rejectionReason: reason,
      photos,
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>بيانات الذبح اليومية</CardTitle>
          <p className="text-sm text-muted-foreground">مطابقة لحقول Evaluation في النموذج المعتمد</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="التاريخ"><Input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></Field>
          <Field label="المزرعة"><div className="flex gap-2"><Input list="farms-list" placeholder="اختر أو اكتب مزرعة" value={farm} onChange={(event) => setFarm(event.target.value)} onBlur={() => void addLocation("farm", farm)} /><datalist id="farms-list">{farms.map((item) => <option key={item} value={item} />)}</datalist><Button type="button" variant="outline" size="icon" onClick={() => void addLocation("farm", farm)} aria-label="إضافة مزرعة"><Plus className="size-4" /></Button></div></Field>
          <Field label="المجزر"><div className="flex gap-2"><Input list="slaughterhouses-list" placeholder="اختر أو اكتب مجزر" value={slaughterhouse} onChange={(event) => setSlaughterhouse(event.target.value)} onBlur={() => void addLocation("slaughterhouse", slaughterhouse)} /><datalist id="slaughterhouses-list">{slaughterhouses.map((item) => <option key={item} value={item} />)}</datalist><Button type="button" variant="outline" size="icon" onClick={() => void addLocation("slaughterhouse", slaughterhouse)} aria-label="إضافة مجزر"><Plus className="size-4" /></Button></div></Field>
          <Field label="نوع الحيوان"><Select value={animalType} onValueChange={setAnimalType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{animalTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="العدد"><Input type="number" min="0" value={number} onChange={(event) => setNumber(event.target.value)} /></Field>
          <Field label="المستلم"><Input type="number" min="0" max={number} value={received} onChange={(event) => setReceived(event.target.value)} /></Field>
          <Field label="وزن المزرعة بالكيلو"><Input type="number" min="0" value={farmWeight} onChange={(event) => setFarmWeight(event.target.value)} /></Field>
          <Field label="وزن الاستلام بالكيلو"><Input type="number" min="0" value={receivingWeight} onChange={(event) => setReceivingWeight(event.target.value)} /></Field>
          <Field label="وزن الذبائح بالكيلو"><Input type="number" min="0" value={carcassWeight} onChange={(event) => setCarcassWeight(event.target.value)} /></Field>
          <Field label="وزن الدهون بالكيلو"><Input type="number" min="0" value={fatWeight} onChange={(event) => setFatWeight(event.target.value)} /></Field>
          <Field label="مدة الرحلة"><Input placeholder="مثال: 2 hours" value={tripDuration} onChange={(event) => setTripDuration(event.target.value)} /></Field>
          <Field label="سبب الرفض الرئيسي"><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue placeholder="اختر السبب" /></SelectTrigger><SelectContent>{rejectionReasons.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Meat quality checklist</CardTitle><p className="text-sm text-muted-foreground">مطابق لأعمدة Total وNonconformity وDegree وNotes في ملف Excel</p></CardHeader>
        <CardContent className="space-y-6">
          {checklistSections.map((section) => {
            const sectionTotal = section.rows.reduce((sum, row) => sum + row.total, 0);
            const sectionDegree = section.rows.reduce((sum, row) => { const nonconformity = Number(nonconformities[row.label] || 0); return sum + row.total * Math.max(0, 1 - nonconformity / Math.max(1, Number(received || 0))); }, 0);
            return <div key={section.title} className="overflow-x-auto rounded-xl border"><div className="bg-primary/10 px-4 py-3 font-semibold">{section.title}</div><table className="w-full min-w-[760px] text-right text-sm"><thead className="bg-muted/40"><tr><th className="px-3 py-2">البند</th><th className="w-24 px-3 py-2">Total</th><th className="w-36 px-3 py-2">Nonconformity</th><th className="w-28 px-3 py-2">Degree</th><th className="px-3 py-2">Notes</th></tr></thead><tbody>{section.rows.map((row) => { const nonconformity = Number(nonconformities[row.label] || 0); const degree = row.total * Math.max(0, 1 - nonconformity / Math.max(1, Number(received || 0))); return <tr key={row.label} className="border-t"><td className="px-3 py-2 font-medium">{row.label}</td><td className="px-3 py-2">{row.total}</td><td className="px-3 py-2"><Input type="number" min="0" value={nonconformities[row.label] ?? ""} onChange={(event) => setNonconformities((current) => ({ ...current, [row.label]: event.target.value }))} /></td><td className="px-3 py-2 font-semibold">{degree.toFixed(1)}</td><td className="px-3 py-2"><Input list={`suggestions-${row.label.replace(/[^a-zA-Z0-9]/g, "-")}`} value={notes[row.label] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [row.label]: event.target.value }))} onBlur={() => void rememberNote(row.label, notes[row.label] ?? "")} placeholder="ملاحظات" /><datalist id={`suggestions-${row.label.replace(/[^a-zA-Z0-9]/g, "-")}`}>{(suggestions[row.label] ?? []).map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist></td></tr>; })}</tbody><tfoot className="border-t bg-primary/5 font-semibold"><tr><td className="px-3 py-2">Total</td><td className="px-3 py-2">{sectionTotal}</td><td className="px-3 py-2">{section.rows.reduce((sum, row) => sum + Number(nonconformities[row.label] || 0), 0)}</td><td className="px-3 py-2">{sectionDegree.toFixed(2)}</td><td /></tr></tfoot></table></div>;
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>المرفقات والصور</CardTitle><p className="text-sm text-muted-foreground">أرفق صور الحالات أو المستندات المرتبطة بالتقرير</p></CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-8 text-sm font-medium transition-colors hover:bg-primary/10">
            <ImagePlus className="size-5 text-primary" />
            <span>إضافة صور</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(0, 8);
              setPhotos(files);
            }}
          /></label>
          {photos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((file, index) => <img key={`${file.name}-${index}`} src={URL.createObjectURL(file)} alt={`صورة مرفقة ${index + 1}`} className="aspect-square rounded-lg border object-cover" />)}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>التقييم الصحي</CardTitle><p className="text-sm text-muted-foreground">درجات AM وPM المستخدمة في التقرير الأصلي</p></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ante-mortem (AM)"><Input type="number" min="0" max="100" value={amScore} onChange={(event) => setAmScore(event.target.value)} /></Field>
          <Field label="Post-mortem (PM)"><Input type="number" min="0" max="100" value={pmScore} onChange={(event) => setPmScore(event.target.value)} /></Field>
          <div className="rounded-xl bg-primary/10 p-4"><p className="text-sm text-muted-foreground">Meat Score</p><p className="mt-1 text-2xl font-bold text-primary">{meatScore}%</p></div>
        </CardContent>
      </Card>
      <Card className="border-primary/30">
        <CardHeader><CardTitle>Daily report summary</CardTitle><p className="text-sm text-muted-foreground">ملخص نهائي مطابق للصفحة الثانية في ملف Excel</p></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Number" value={number || 0} /><Summary label="Nonconformity / المقبول" value={received || 0} /><Summary label="Rejected" value={rejected} danger /><Summary label="Carcass weight" value={`${Number(carcassWeight || 0).toLocaleString()} kg`} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Farm weight" value={`${Number(farmWeight || 0).toLocaleString()} kg`} /><Summary label="Receiving weight" value={`${Number(receivingWeight || 0).toLocaleString()} kg`} /><Summary label="Transportation loss" value={`${Math.max(0, Number(farmWeight || 0) - Number(receivingWeight || 0)).toLocaleString()} kg`} /><Summary label="Exception %" value={`${number ? Math.round((rejected / Number(number)) * 100) : 0}%`} /></div>
          <div className="rounded-xl bg-primary/10 p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Slaughtering evaluation / SCORE</p><p className="mt-1 text-3xl font-bold text-primary">{checklistScore.toFixed(1)}%</p></div><Progress value={checklistScore} className="max-w-xs" /></div><p className="mt-3 text-sm text-muted-foreground">Total degree: {checklistDegree.toFixed(2)} / {checklistTotal}</p></div>
          <Separator />
          <Button onClick={saveDraft}><ClipboardCheck className="ml-2 size-4" /> حفظ التقرير اليومي كمسودة</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Summary({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className={danger ? "mt-1 text-2xl font-bold text-destructive" : "mt-1 text-2xl font-bold"}>{value}</p></div>; }

export default SlaughteringPage;

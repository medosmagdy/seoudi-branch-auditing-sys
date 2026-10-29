import { SlaughterLocationSelect } from "./SlaughterLocationSelect";
import { addSlaughterLocation, type SlaughterLocationKind } from "@/lib/slaughter-locations";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { slaughterChecklist } from "@/lib/slaughter-checklist";
import {
  defaultSlaughterMode,
  emptySlaughterInput,
  evaluateSlaughter,
  finiteNumber,
  hijriForDate,
  seasonForHijri,
  slaughterWarnings,
  validateSlaughterInput,
  type SlaughterInput,
  type SlaughterCase,
} from "@/lib/slaughter-evaluation";
import type { SlaughterReport } from "@/lib/slaughter-model";
import type { SlaughterDraft } from "@/lib/slaughter-report";
import { SlaughterMetrics } from "./SlaughterDailyReport";
const selectClass = "h-10 w-full rounded-md border bg-background px-2 text-sm";
export function SlaughterForm({
  date,
  initial,
  onDate,
  farms,
  houses,
  onSave,
  onCreateLocation = addSlaughterLocation,
  notify,
}: {
  date: string;
  initial?: SlaughterReport | null;
  onDate: (v: string) => void;
  farms: string[];
  houses: string[];
  onSave: (v: SlaughterDraft) => Promise<boolean>;
  onCreateLocation?: (kind: SlaughterLocationKind, name: string) => Promise<string>;
  notify: (v: string) => void;
}) {
  const [input, setInput] = useState<SlaughterInput>(() =>
    initial?.details?.version === 2
      ? structuredClone(initial.details.input)
      : {
          ...emptySlaughterInput(),
          hijriDate: hijriForDate(date),
          season: seasonForHijri(hijriForDate(date)),
        },
  );
  const [farm, setFarm] = useState(initial?.farm ?? "");
  const [house, setHouse] = useState(initial?.slaughterhouse ?? "");
  const [type, setType] = useState(initial?.animalType ?? "Bulls");
  const [rejectionReason, setRejectionReason] = useState(initial?.rejectionReasons ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("slaughter_suggestions")
        .select("item_key,suggestion")
        .eq("is_active", true);
      if (!active || error) return;
      const next: Record<string, string[]> = {};
      for (const row of data ?? [])
        next[row.item_key] = [...(next[row.item_key] ?? []), row.suggestion];
      setSuggestions(next);
    })();
    return () => {
      active = false;
    };
  }, []);
  const rememberNote = async (item: string, note: string) => {
    const value = note.trim();
    if (!value || (suggestions[item] ?? []).includes(value)) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await (supabase as any)
      .from("slaughter_suggestions")
      .upsert(
        { item_key: item, suggestion: value, created_by: data.user.id },
        { onConflict: "item_key,suggestion" },
      );
    if (!error) setSuggestions((old) => ({ ...old, [item]: [...(old[item] ?? []), value] }));
  };
  const [saving, setSaving] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const locationLock = useRef(false);
  const createLocation = async (kind: SlaughterLocationKind, name: string) => {
    if (locationLock.current) throw new Error("انتظر اكتمال حفظ الاسم الحالي");
    locationLock.current = true;
    setAddingLocation(true);
    try {
      return await onCreateLocation(kind, name);
    } finally {
      locationLock.current = false;
      setAddingLocation(false);
    }
  };
  const lock = useRef(false);
  const result = useMemo(() => evaluateSlaughter(input), [input]);
  const warnings = slaughterWarnings(input);
  const set = <K extends keyof SlaughterInput>(key: K, value: SlaughterInput[K]) =>
    setInput((old) => ({ ...old, [key]: value }));
  const urls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  const save = async () => {
    if (lock.current) return;
    if (locationLock.current) {
      notify("انتظر حفظ اسم المزرعة أو المجزر قبل حفظ التقرير");
      return;
    }
    if (!farm.trim() || !house.trim()) {
      notify("اختر المزرعة والمجزر");
      return;
    }
    const error = validateSlaughterInput(input);
    if (error) {
      notify(error);
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      await onSave({
        ...(initial ? { id: String(initial.id) } : {}),
        date,
        farm: farm.trim(),
        slaughterhouse: house.trim(),
        animalType: type,
        number: input.number,
        received: input.received,
        carcassWeight: input.carcassWeight ?? 0,
        meatScore: result.score,
        rejectionReason,
        acceptedException: input.acceptedException,
        photos,
        details: { version: 2, score: result.score, input, evaluation: result },
      });
    } catch {
      notify("تعذر حفظ التقرير؛ راجع الاتصال");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const numberField = (key: keyof SlaughterInput, label: string, integer = false) => (
    <label className="space-y-1 text-xs" key={key}>
      {label}
      <Input
        type="number"
        min="0"
        step={integer ? 1 : "any"}
        value={(input[key] as number) ?? ""}
        onChange={(e) => set(key, (finiteNumber(e.target.value) ?? (integer ? 0 : null)) as never)}
      />
    </label>
  );
  return (
    <fieldset disabled={saving || addingLocation} className="space-y-4" dir="rtl">
      <Tabs defaultValue="information" dir="rtl">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="information">بيانات الزيارة</TabsTrigger>
          <TabsTrigger value="checklist">التقييم</TabsTrigger>
          <TabsTrigger value="cases">الحالات والملاحظات</TabsTrigger>
          <TabsTrigger value="photos">السيارات والصور</TabsTrigger>
        </TabsList>
        <TabsContent value="information">
          <Card>
            <CardHeader>
              <CardTitle>بيانات الذبح اليومية</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-xs">
                التاريخ
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    onDate(e.target.value);
                    const hijri = hijriForDate(e.target.value);
                    setInput((old) => ({
                      ...old,
                      hijriDate: hijri,
                      season: seasonForHijri(hijri),
                    }));
                  }}
                />
              </label>
              <label className="space-y-1 text-xs">
                التاريخ الهجري
                <Input
                  dir="ltr"
                  value={input.hijriDate}
                  onChange={(e) =>
                    setInput((old) => ({
                      ...old,
                      hijriDate: e.target.value,
                      season: seasonForHijri(e.target.value),
                    }))
                  }
                />
                <span className="text-muted-foreground">تحويل أم القرى؛ يمكن مراجعته وتعديله.</span>
              </label>
              <label className="space-y-1 text-xs">
                الموسم
                <select
                  className={selectClass}
                  value={input.season}
                  onChange={(e) => set("season", e.target.value as SlaughterInput["season"])}
                >
                  <option>Normal</option>
                  <option>Ramadan</option>
                  <option>Adha Season</option>
                </select>
              </label>
              <SlaughterLocationSelect
                kind="farm"
                label="المزرعة"
                names={farms}
                value={farm}
                onChange={setFarm}
                onCreate={createLocation}
              />
              <label className="space-y-1 text-xs">
                موقع المزرعة
                <Input
                  value={input.farmLocation}
                  onChange={(e) => set("farmLocation", e.target.value)}
                />
              </label>
              <SlaughterLocationSelect
                kind="slaughterhouse"
                label="المجزر"
                names={houses}
                value={house}
                onChange={setHouse}
                onCreate={createLocation}
              />
              <label className="space-y-1 text-xs">
                موقع المجزر
                <Input
                  value={input.slaughterhouseLocation}
                  onChange={(e) => set("slaughterhouseLocation", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs">
                نوع الحيوان
                <select
                  className={selectClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {["Bulls", "Sheep", "Goats", "Buffalo"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                السلالة
                <Input
                  value={input.breed}
                  onChange={(e) => set("breed", e.target.value)}
                  placeholder="Native breed مثلًا"
                />
              </label>
              {numberField("number", "العدد الكلي", true)}
              {numberField("received", "المستلم", true)}
              {numberField("acceptedException", "المقبول استثنائيًا من المستلم", true)}
              <label className="space-y-1 text-xs">
                سبب الرفض العام
                <Input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </label>
              {numberField("farmWeight", "وزن المزرعة (كجم)")}
              {numberField("receivingWeight", "وزن الاستلام (كجم)")}
              {numberField("rejectedWeight", "وزن المرفوض (كجم)")}
              {numberField("carcassWeight", "وزن الذبائح (كجم)")}
              {numberField("fatWeight", "وزن الدهون (كجم)")}
              {numberField("condemnationWeight", "وزن الإعدامات (كجم)")}
              <label className="space-y-1 text-xs">
                مدة الرحلة
                <Input
                  value={input.tripDuration}
                  onChange={(e) => set("tripDuration", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs">
                مصدر الأوزان
                <select
                  className={selectClass}
                  value={input.weightSource}
                  onChange={(e) => set("weightSource", e.target.value as "measured" | "estimated")}
                >
                  <option value="measured">وزن مقاس</option>
                  <option value="estimated">تقدير أو حساب</option>
                </select>
              </label>
              {input.weightSource === "estimated" && (
                <label className="space-y-1 text-xs">
                  طريقة التقدير
                  <Input
                    value={input.weightSourceNote}
                    onChange={(e) => set("weightSourceNote", e.target.value)}
                  />
                </label>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="checklist" className="space-y-4">
          <p className="rounded-lg border p-3 text-xs">
            عدم المطابقة = عدد الحيوانات المتأثرة من المستلم، وليس عدد الأعضاء. البنود ذات الدرجة
            المباشرة تحتاج اختيار الدرجة صراحة؛ الصفر درجة صحيحة والفراغ غير مكتمل.
          </p>
          {slaughterChecklist.map((section, index) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <p className="text-sm">
                  الدرجة: {result.sectionScores[index]?.degree?.toFixed(2) ?? "غير مكتمل"} /{" "}
                  {result.sectionScores[index]?.maximum}
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-right text-xs">
                    <thead>
                      <tr>
                        {["البند", "القصوى", "طريقة التقييم", "القيمة", "الدرجة", "ملاحظة"].map(
                          (h) => (
                            <th className="p-2" key={h}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, rowIndex) => {
                        const mode = input.modes[row.label] ?? defaultSlaughterMode(row.label);
                        const computed = result.checklist.find((r) => r.item === row.label);
                        return (
                          <tr className="border-t" key={row.label}>
                            <td className="p-2 font-semibold">{row.label}</td>
                            <td>{row.total}</td>
                            <td className="p-2">
                              <select
                                aria-label={`طريقة تقييم ${row.label}`}
                                className={selectClass}
                                value={mode}
                                onChange={(e) =>
                                  set("modes", {
                                    ...input.modes,
                                    [row.label]: e.target.value as "count" | "direct",
                                  })
                                }
                              >
                                <option value="count">عدد الحيوانات</option>
                                <option value="direct">درجة مباشرة</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <Input
                                aria-label={`قيمة ${row.label}`}
                                className="w-28"
                                type="number"
                                min="0"
                                max={mode === "direct" ? row.total : input.received}
                                step={mode === "direct" ? "any" : "1"}
                                value={
                                  (mode === "direct" ? input.directDegrees : input.nonconformities)[
                                    row.label
                                  ] ?? ""
                                }
                                placeholder={mode === "direct" ? "اختر الدرجة" : "0 حالة"}
                                onChange={(e) =>
                                  set(mode === "direct" ? "directDegrees" : "nonconformities", {
                                    ...(mode === "direct"
                                      ? input.directDegrees
                                      : input.nonconformities),
                                    [row.label]: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="p-2 font-bold">{computed?.degree?.toFixed(2) ?? "—"}</td>
                            <td className="p-2">
                              <Input
                                aria-label={`ملاحظة ${row.label}`}
                                list={`slaughter-note-${index}-${rowIndex}`}
                                onBlur={() =>
                                  void rememberNote(row.label, input.notes[row.label] ?? "")
                                }
                                value={input.notes[row.label] ?? ""}
                                onChange={(e) =>
                                  set("notes", { ...input.notes, [row.label]: e.target.value })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="cases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ملاحظات الذبح المهمة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["rejection", "الرفض"],
                  ["trimming", "التشذيب Trimming"],
                  ["condemnation", "الإعدامات Condemnation"],
                ] as const
              ).map(([key, label]) => (
                <label className="space-y-2 text-xs" key={key}>
                  {label}
                  <Textarea
                    value={input.importantNotes[key]}
                    onChange={(e) =>
                      set("importantNotes", { ...input.importantNotes, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ملاحظات إضافية لأعمدة Grand Total</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["cuttingLegLigaments", "قطع أربطة الأرجل"],
                  ["heterogeneousSelection", "عدم تجانس الاختيار"],
                  ["badStamping", "مشاكل الختم"],
                  ["bruises", "الكدمات — تفاصيل مستقلة عن بند التقييم"],
                  ["overCapacityRoughHandling", "زيادة الحمولة والتعامل العنيف"],
                ] as const
              ).map(([key, label]) => (
                <label className="space-y-1 text-xs" key={key}>
                  {label}
                  <Input
                    value={input.observations?.[key] ?? ""}
                    onChange={(e) =>
                      set("observations", {
                        cuttingLegLigaments: "",
                        heterogeneousSelection: "",
                        badStamping: "",
                        bruises: "",
                        overCapacityRoughHandling: "",
                        ...input.observations,
                        [key]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>تفاصيل الحالات والكميات</CardTitle>
              <p className="text-xs">
                12 قطعة و6 أزواج نفس كمية الأعضاء، لكن عدد الحيوانات يُسجّل مستقلًا. تفاصيل الأعضاء
                لا تغيّر درجات البنود تلقائيًا.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {input.cases.map((item, index) => {
                const edit = (patch: Partial<SlaughterCase>) =>
                  set(
                    "cases",
                    input.cases.map((r, i) => (i === index ? { ...r, ...patch } : r)),
                  );
                return (
                  <div
                    key={index}
                    className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3 lg:grid-cols-4"
                  >
                    <label className="text-xs">
                      نوع الحالة
                      <select
                        className={selectClass}
                        value={item.kind}
                        onChange={(e) => edit({ kind: e.target.value as SlaughterCase["kind"] })}
                      >
                        <option value="rejection">رفض</option>
                        <option value="trimming">تشذيب</option>
                        <option value="condemnation">إعدام</option>
                      </select>
                    </label>
                    {item.kind === "rejection" && (
                      <label className="text-xs">
                        مرحلة الرفض
                        <select
                          className={selectClass}
                          value={item.rejectionStage ?? "unspecified"}
                          onChange={(e) =>
                            edit({
                              rejectionStage: e.target.value as "live" | "carcass" | "unspecified",
                            })
                          }
                        >
                          <option value="unspecified">غير محدد</option>
                          <option value="live">حي Live</option>
                          <option value="carcass">ذبيحة Carcass</option>
                        </select>
                      </label>
                    )}
                    <label className="text-xs">
                      العضو أو الحالة
                      <Input value={item.item} onChange={(e) => edit({ item: e.target.value })} />
                    </label>
                    <label className="text-xs">
                      الكمية
                      <Input
                        type="number"
                        min="0"
                        step={item.unit === "kg" ? "any" : 1}
                        value={item.quantity ?? ""}
                        onChange={(e) => edit({ quantity: finiteNumber(e.target.value) })}
                      />
                    </label>
                    <label className="text-xs">
                      الوحدة
                      <select
                        className={selectClass}
                        value={item.unit}
                        onChange={(e) => edit({ unit: e.target.value as SlaughterCase["unit"] })}
                      >
                        {[
                          ["piece", "قطعة"],
                          ["pair", "زوج"],
                          ["animal", "حيوان"],
                          ["carcass", "ذبيحة"],
                          ["kg", "كجم"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      الحيوانات المتأثرة
                      <Input
                        type="number"
                        min="0"
                        max={input.number}
                        value={item.affectedAnimals ?? ""}
                        onChange={(e) => edit({ affectedAnimals: finiteNumber(e.target.value) })}
                      />
                    </label>
                    <label className="text-xs">
                      الوزن (كجم)
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.weight ?? ""}
                        onChange={(e) => edit({ weight: finiteNumber(e.target.value) })}
                      />
                    </label>
                    <label className="text-xs">
                      تصنيف السبب
                      <select
                        className={selectClass}
                        value={item.category}
                        onChange={(e) =>
                          edit({ category: e.target.value as SlaughterCase["category"] })
                        }
                      >
                        {[
                          ["other", "أخرى"],
                          ["parasitic", "طفيلي"],
                          ["viral", "فيروسي"],
                          ["tb", "TB"],
                          ["managemental", "إداري/ممارسات"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      السبب
                      <Input
                        value={item.reason}
                        onChange={(e) => edit({ reason: e.target.value })}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        set(
                          "cases",
                          input.cases.filter((_, i) => i !== index),
                        )
                      }
                    >
                      حذف السطر
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  set("cases", [
                    ...input.cases,
                    {
                      kind: "condemnation",
                      item: "",
                      quantity: null,
                      unit: "piece",
                      affectedAnimals: null,
                      weight: null,
                      reason: "",
                      category: "other",
                    },
                  ])
                }
              >
                إضافة حالة
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="photos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>سيارات النقل المبرد وحرارة المغادرة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {input.trucks.map((truck, index) => (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}>
                  <Input
                    aria-label="رقم السيارة"
                    placeholder="رقم السيارة"
                    value={truck.number}
                    onChange={(e) =>
                      set(
                        "trucks",
                        input.trucks.map((t, i) =>
                          i === index ? { ...t, number: e.target.value } : t,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="حرارة المغادرة"
                    type="number"
                    step="any"
                    placeholder="درجة مئوية"
                    value={truck.temperature ?? ""}
                    onChange={(e) =>
                      set(
                        "trucks",
                        input.trucks.map((t, i) =>
                          i === index ? { ...t, temperature: finiteNumber(e.target.value) } : t,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      set(
                        "trucks",
                        input.trucks.filter((_, i) => i !== index),
                      )
                    }
                  >
                    حذف
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => set("trucks", [...input.trucks, { number: "", temperature: null }])}
              >
                إضافة سيارة
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>صور التقرير</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 12))}
              />
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {urls.map((url, index) => (
                  <img
                    src={url}
                    alt={photos[index]?.name}
                    className="aspect-square w-full rounded border object-cover"
                    key={url}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Card>
        <CardHeader>
          <CardTitle>ملخص التقرير اليومي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SlaughterMetrics input={input} />
          {warnings.map((text) => (
            <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs" key={text}>
              {text}
            </p>
          ))}
          {result.missing.length > 0 && (
            <p className="text-sm text-amber-700">
              التقييم غير مكتمل: راجع {result.missing.length} بندًا. تُحفظ المسودة دون اختراع درجات
              للبنود الفارغة.
            </p>
          )}
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "جاري الحفظ…" : "حفظ التقرير اليومي كمسودة"}
          </Button>
        </CardContent>
      </Card>
    </fieldset>
  );
}

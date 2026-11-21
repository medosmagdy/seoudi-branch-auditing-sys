import { loadChecklistTypes, loadChecklistTree } from "@/lib/checklist-data";
import { invalidateDashboard } from "@/lib/dashboard/cache";
import { useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Upload,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function ChecklistManager() {
  const queryClient = useQueryClient();
  const [typeId, setTypeId] = useState("");
  const [importing, setImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newScoringSystem, setNewScoringSystem] = useState<"4-1-0" | "4-2-0" | "4-2-1-0">(
    "4-2-1-0",
  );
  const [newSection, setNewSection] = useState("");
  const [newSectionIsDelivery, setNewSectionIsDelivery] = useState(false);
  const [newHeader, setNewHeader] = useState<Record<string, string>>({});
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [openSection, setOpenSection] = useState<string | null>(null);

  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [editingHeaderName, setEditingHeaderName] = useState("");

  const {
    data: types,
    isLoading: typesLoading,
    isError: typesError,
    refetch: retryTypes,
  } = useQuery({
    queryKey: ["audit-types"],
    queryFn: ({ signal }) => loadChecklistTypes(signal),
  });

  const {
    data: tree,
    isLoading: treeLoading,
    isError: treeError,
    refetch: retryTree,
  } = useQuery({
    queryKey: ["checklist", typeId],
    enabled: Boolean(typeId),
    queryFn: ({ signal }) => loadChecklistTree(typeId, signal),
  });

  const refresh = () => {
    void invalidateDashboard(queryClient);
    queryClient.invalidateQueries({ queryKey: ["checklist", typeId] });
    queryClient.invalidateQueries({ queryKey: ["audit-types"] });
  };

  const selectedAuditType = types?.find((t) => t.id === typeId);

  const sectionViewModels = useMemo(
    () =>
      (tree?.sections ?? []).map((section) => ({
        section,
        headers: (tree?.headers ?? []).filter((header) => header.section_id === section.id),
        questions: (tree?.questions ?? []).filter((question) => question.section_id === section.id),
      })),
    [tree],
  );

  const toggleAuditTypeActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("audit_types")
      .update({ active: !current })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast.error("تعذر تعديل الحالة");
      return;
    }
    toast.success(!current ? "تم تفعيل نوع التدقيق" : "تم إلغاء تفعيل نوع التدقيق");
    refresh();
  };

  const saveAuditTypeName = async (id: string) => {
    if (!editingTypeName.trim()) return;
    const { error } = await supabase
      .from("audit_types")
      .update({ name_ar: editingTypeName.trim() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast.error("تعذر إعادة التسمية");
      return;
    }
    toast.success("تم تحديث الاسم بنجاح");
    setEditingTypeId(null);
    refresh();
  };

  const deleteAuditType = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف نوع التدقيق بالكامل؟")) return;
    const { count, error: countError } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("audit_type_id", id);
    if (countError || count === null) {
      toast.error("تعذر التحقق من الفحوصات المرتبطة؛ لم يتم الحذف");
      return;
    }
    if (count > 0) {
      toast.error(
        "لا يمكن حذف نوع التدقيق لوجود فحوصات وزيارات مرتبطة به. يمكنك تعطيله بدلاً من ذلك.",
      );
      return;
    }
    const { error } = await supabase
      .from("audit_types")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast.error("تعذر الحذف، يرجى تفريغ الأقسام التابعة له أولاً");
      return;
    }
    toast.success("تم حذف نوع التدقيق");
    setTypeId("");
    refresh();
  };

  const saveSectionName = async (id: string) => {
    if (!editingSectionName.trim()) return;
    const { error } = await supabase
      .from("sections")
      .update({ name_ar: editingSectionName.trim() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast.error("تعذر إعادة تسمية القسم");
      return;
    }
    toast.success("تم تعديل اسم القسم");
    setEditingSectionId(null);
    refresh();
  };

  const deleteSection = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف القسم وكافة الأسئلة التابعة له؟")) return;
    try {
      await supabase.from("questions").delete().eq("section_id", id).throwOnError();
      await supabase.from("headers").delete().eq("section_id", id).throwOnError();
      await supabase.from("sections").delete().eq("id", id).select("id").single().throwOnError();
      toast.success("تم حذف القسم");
    } catch {
      toast.error("تعذر إكمال حذف القسم؛ تم إيقاف العملية. راجع القائمة قبل إعادة المحاولة");
    } finally {
      refresh();
    }
  };

  const saveHeaderName = async (id: string) => {
    if (!editingHeaderName.trim()) return;
    const { error } = await supabase
      .from("headers")
      .update({ label_ar: editingHeaderName.trim() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast.error("تعذر تعديل العنوان");
      return;
    }
    toast.success("تم تعديل اسم العنوان");
    setEditingHeaderId(null);
    refresh();
  };

  const deleteHeader = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العنوان؟ (الأسئلة التابعة له ستصبح بدون عنوان)")) return;
    try {
      await supabase
        .from("questions")
        .update({ header_id: null })
        .eq("header_id", id)
        .throwOnError();
      await supabase.from("headers").delete().eq("id", id).select("id").single().throwOnError();
      toast.success("تم حذف العنوان الفرعي");
    } catch {
      toast.error("تعذر إكمال حذف العنوان؛ راجع القائمة قبل إعادة المحاولة");
    } finally {
      refresh();
    }
  };

  const addAuditType = async () => {
    if (!newTypeName.trim() || !newTypeCode.trim()) {
      toast.error("أدخل اسم نوع التدقيق والكود");
      return;
    }
    const { data: created, error } = await supabase
      .from("audit_types")
      .insert({
        name_ar: newTypeName.trim().slice(0, 120),
        name_en: newTypeName.trim().slice(0, 120),
        code: newTypeCode.trim().slice(0, 40),
        scoring_system: newScoringSystem,
      } as never)
      .select("id")
      .single();
    if (error || !created) {
      toast.error("تعذر إضافة نوع التدقيق");
      return;
    }
    setNewTypeName("");
    setNewTypeCode("");
    setNewScoringSystem("4-1-0");
    setTypeId(created.id);
    toast.success("تمت إضافة نوع التدقيق");
    refresh();
  };

  const purgeChecklist = async () => {
    const { data: oldQuestions } = await supabase
      .from("questions")
      .select("id")
      .eq("audit_type_id", typeId)
      .throwOnError();
    const ids = (oldQuestions ?? []).map((question) => question.id);
    if (ids.length) {
      const { count } = await supabase
        .from("audit_answers")
        .select("id", { count: "exact", head: true })
        .in("question_id", ids)
        .throwOnError();
      if (count && count > 0) {
        await supabase
          .from("questions")
          .update({ active: false })
          .eq("audit_type_id", typeId)
          .throwOnError();
        await supabase
          .from("sections")
          .update({ active: false })
          .eq("audit_type_id", typeId)
          .throwOnError();
        return "archived" as const;
      }
      await supabase.from("questions").delete().eq("audit_type_id", typeId).throwOnError();
    }
    const { data: oldSections } = await supabase
      .from("sections")
      .select("id")
      .eq("audit_type_id", typeId)
      .throwOnError();
    const sectionIds = (oldSections ?? []).map((section) => section.id);
    if (sectionIds.length) {
      await supabase.from("headers").delete().in("section_id", sectionIds).throwOnError();
      await supabase.from("sections").delete().eq("audit_type_id", typeId).throwOnError();
    }
    return "deleted" as const;
  };

  // معالج استيراد ذكي وشامل لجميع أنواع الفحوصات (FS, GHP, FSMS)
  const importChecklist = async (file: File) => {
    if (importing) return;
    if (!typeId) {
      toast.error("اختر نوع التدقيق أولاً");
      return;
    }
    setImporting(true);
    try {
      const { readChecklistFile, validateChecklistWorkbook, importChecklistWorkbook } =
        await import("@/lib/checklist-import");
      const workbook = await readChecklistFile(file);
      await validateChecklistWorkbook(workbook, {
        typeId,
        sectionCount: tree?.sections?.length ?? 0,
        questionCount: tree?.questions?.length ?? 0,
      });
      await (replaceExisting ? purgeChecklist() : Promise.resolve(null));
      const { totalSections, totalQuestions } = await importChecklistWorkbook(workbook, {
        typeId,
        sectionCount: tree?.sections?.length ?? 0,
        questionCount: tree?.questions?.length ?? 0,
      });

      toast.success(`تم استيراد ${totalSections} قسماً و ${totalQuestions} بنداً بنجاح!`);
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error(error instanceof Error ? error.message : "تعذر استيراد ملف الإكسيل");
    } finally {
      refresh();
      setImporting(false);
    }
  };

  const addSection = async () => {
    if (!typeId || !newSection.trim()) {
      toast.error("يرجى كتابة اسم القسم أولاً");
      return;
    }
    const order = tree?.sections.length ?? 0;
    const { error } = await supabase.from("sections").insert({
      audit_type_id: typeId,
      name_ar: newSection.trim().slice(0, 160),
      order_index: order,
      is_delivery: newSectionIsDelivery || /delivery|توصيل/i.test(newSection),
      active: true,
    } as never);

    if (error) {
      toast.error("تعذر إضافة القسم: " + error.message);
      return;
    }

    toast.success("تم إضافة القسم بنجاح");
    setNewSection("");
    setNewSectionIsDelivery(false);
    refresh();
  };

  const addHeader = async (sectionId: string) => {
    const label = (newHeader[sectionId] ?? "").trim();
    if (!label) return;
    const order = tree?.headers.filter((header) => header.section_id === sectionId).length ?? 0;
    const { error } = await supabase.from("headers").insert({
      section_id: sectionId,
      label_ar: label.slice(0, 160),
      order_index: order,
    } as never);
    if (error) {
      toast.error("تعذر إضافة العنوان؛ أعد المحاولة");
      return;
    }
    setNewHeader((prev) => ({ ...prev, [sectionId]: "" }));
    refresh();
  };

  const addQuestion = async (sectionId: string, headerId: string | null) => {
    const key = headerId ?? sectionId;
    const text = (newQuestion[key] ?? "").trim();
    if (!text) return;
    const order = tree?.questions.length ?? 0;
    const { error } = await supabase.from("questions").insert({
      audit_type_id: typeId,
      section_id: sectionId,
      header_id: headerId,
      item_id: `M-${order + 1}`,
      text_ar: text.slice(0, 500),
      max_score: 4,
      item_order: order,
      active: true,
    } as never);
    if (error) {
      toast.error("تعذر إضافة البند؛ أعد المحاولة");
      return;
    }
    setNewQuestion((prev) => ({ ...prev, [key]: "" }));
    refresh();
  };

  const swapOrder = async (
    table: "sections" | "headers" | "questions",
    field: "order_index" | "item_order",
    a: { id: string; order: number },
    b: { id: string; order: number },
  ) => {
    try {
      const results = await Promise.all([
        supabase
          .from(table)
          .update({ [field]: b.order } as never)
          .eq("id", a.id),
        supabase
          .from(table)
          .update({ [field]: a.order } as never)
          .eq("id", b.id),
      ]);
      if (results.some((result) => result.error)) throw new Error("تعذر الترتيب");
    } catch {
      toast.error("تعذر إكمال تغيير الترتيب؛ راجع ترتيب القائمة بعد التحديث");
    } finally {
      refresh();
    }
  };

  if (typesLoading || (typeId && treeLoading))
    return (
      <div role="status" className="surface-card p-6 text-center">
        جاري تحميل قوائم التفتيش…
      </div>
    );
  if (typesError || treeError)
    return (
      <div role="alert" className="surface-card space-y-3 p-6 text-center" dir="rtl">
        <p>تعذر تحميل قائمة التفتيش كاملة. أعد المحاولة قبل تعديل البنود.</p>
        <Button
          variant="outline"
          onClick={() => {
            if (typesError) void retryTypes();
            if (treeError) void retryTree();
          }}
        >
          إعادة المحاولة
        </Button>
      </div>
    );

  return (
    <fieldset disabled={importing} aria-busy={importing} className="min-w-0 space-y-4" dir="rtl">
      <div className="surface-card space-y-4 p-5">
        <div className="space-y-2">
          <Label className="font-bold">نوع التدقيق الحالي</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px]">
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع التدقيق" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {types?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name_ar} {type.active ? "" : "(غير مفعّل)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAuditType && (
              <div className="flex items-center gap-2">
                {editingTypeId === selectedAuditType.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-8 w-44 text-xs"
                      value={editingTypeName}
                      onChange={(e) => setEditingTypeName(e.target.value)}
                    />
                    <Button
                      size="icon"
                      className="size-8"
                      onClick={() => saveAuditTypeName(selectedAuditType.id)}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setEditingTypeId(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      setEditingTypeId(selectedAuditType.id);
                      setEditingTypeName(selectedAuditType.name_ar);
                    }}
                  >
                    <Pencil className="size-3.5" /> إعادة تسمية
                  </Button>
                )}

                <Button
                  size="sm"
                  variant={selectedAuditType.active ? "outline" : "default"}
                  className="h-8 text-xs font-semibold"
                  onClick={() =>
                    toggleAuditTypeActive(selectedAuditType.id, selectedAuditType.active)
                  }
                >
                  {selectedAuditType.active ? "تعطيل النوع" : "تفعيل النوع"}
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs gap-1"
                  onClick={() => deleteAuditType(selectedAuditType.id)}
                >
                  <Trash2 className="size-3.5" /> حذف النوع
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tname">إضافة نوع تدقيق جديد</Label>
            <Input
              id="tname"
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              placeholder="مثال: تدقيق GHP أو FSMS"
            />
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="tcode">الكود</Label>
            <Input
              id="tcode"
              value={newTypeCode}
              onChange={(event) => setNewTypeCode(event.target.value)}
              placeholder="GHP"
            />
          </div>
          <div className="w-36 space-y-1.5">
            <Label htmlFor="tscoring">نظام التقييم</Label>
            <Select
              value={newScoringSystem}
              onValueChange={(value) => setNewScoringSystem(value as "4-1-0" | "4-2-0" | "4-2-1-0")}
            >
              <SelectTrigger id="tscoring">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4-1-0">4-1-0</SelectItem>
                <SelectItem value="4-2-0">4-2-0</SelectItem>
                <SelectItem value="4-2-1-0">4-2-1-0 (كل الدرجات)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addAuditType} className="gap-1.5">
            <Plus className="size-4" /> إضافة نوع
          </Button>
        </div>

        {typeId && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {importing ? "جارٍ تحليل واستيراد الملف الذكي…" : "استيراد ملف Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importChecklist(file);
                  event.target.value = "";
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => setReplaceExisting(!replaceExisting)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all select-none ${
                replaceExisting
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-border bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span
                className={`size-2.5 rounded-full ${replaceExisting ? "bg-emerald-600" : "bg-muted-foreground"}`}
              />
              {replaceExisting
                ? "استبدال القائمة بالكامل (مفعل)"
                : "إضافة إلى القائمة الحالية دون استبدال"}
            </button>

            <p className="w-full text-xs text-muted-foreground">
              النظام يتعرف تلقائياً على نوع الملف: <strong>Stores FS</strong>، أو{" "}
              <strong>GHP</strong>، أو <strong>FSMS</strong>، ويقوم بتوليد الأقسام والعناوين والبنود
              الخاصة بكل نموذج.
            </p>
          </div>
        )}
      </div>

      {typeId && (
        <div className="surface-card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 space-y-1.5 min-w-[200px]">
            <Label htmlFor="newsec">إضافة قسم جديد</Label>
            <Input
              id="newsec"
              value={newSection}
              onChange={(event) => setNewSection(event.target.value)}
              placeholder="اسم القسم الجديد..."
            />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Switch
              id="new-del"
              checked={newSectionIsDelivery}
              onCheckedChange={setNewSectionIsDelivery}
            />
            <Label htmlFor="new-del" className="text-xs cursor-pointer text-muted-foreground">
              قسم توصيل (Delivery)
            </Label>
          </div>

          <Button onClick={addSection} className="gap-1.5">
            <Plus className="size-4" /> إضافة قسم
          </Button>
        </div>
      )}

      {sectionViewModels.map(
        ({ section, headers: sectionHeaders, questions: sectionQuestions }, sectionIndex) => {
          const isOpen = openSection === section.id;

          return (
            <div key={section.id} className="surface-card p-4 rounded-xl border border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {editingSectionId === section.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-8 w-56 text-xs"
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                      />
                      <Button
                        size="icon"
                        className="size-8"
                        onClick={() => saveSectionName(section.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => setEditingSectionId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="text-sm font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                      onClick={() => setOpenSection(isOpen ? null : section.id)}
                    >
                      {section.name_ar}
                      {section.is_delivery && (
                        <Badge variant="outline" className="text-[10px] mr-1">
                          توصيل
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[11px] font-mono mr-1">
                        {sectionQuestions.length} بند
                      </Badge>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 mr-auto" dir="ltr">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="تحريك لأعلى"
                    disabled={sectionIndex === 0}
                    onClick={() => {
                      const prev = tree!.sections[sectionIndex - 1]!;
                      swapOrder(
                        "sections",
                        "order_index",
                        { id: section.id, order: section.order_index },
                        { id: prev.id, order: prev.order_index },
                      );
                    }}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="تحريك لأسفل"
                    disabled={sectionIndex === tree!.sections.length - 1}
                    onClick={() => {
                      const next = tree!.sections[sectionIndex + 1]!;
                      swapOrder(
                        "sections",
                        "order_index",
                        { id: section.id, order: section.order_index },
                        { id: next.id, order: next.order_index },
                      );
                    }}
                  >
                    <ChevronDown className="size-4" />
                  </Button>

                  {editingSectionId !== section.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="تعديل اسم القسم"
                      onClick={() => {
                        setEditingSectionId(section.id);
                        setEditingSectionName(section.name_ar);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:bg-destructive/10"
                    title="حذف القسم"
                    onClick={() => deleteSection(section.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>

                  <div className="flex items-center gap-1.5 mr-2">
                    <Switch
                      checked={section.active}
                      onCheckedChange={async (value) => {
                        await supabase
                          .from("sections")
                          .update({ active: value })
                          .eq("id", section.id);
                        refresh();
                      }}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {section.active ? "مفعل" : "معطل"}
                    </span>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-4 pt-3 border-t border-border/60">
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      className="flex-1 text-xs"
                      placeholder="عنوان فرعي جديد (مجموعة بنود)..."
                      value={newHeader[section.id] ?? ""}
                      onChange={(event) =>
                        setNewHeader((prev) => ({ ...prev, [section.id]: event.target.value }))
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => addHeader(section.id)}>
                      إضافة عنوان فرعي
                    </Button>
                  </div>

                  {[
                    ...sectionHeaders.map((header) => ({ id: header.id, label: header.label_ar })),
                    { id: null, label: "بدون عنوان فرعي" },
                  ].map((group) => {
                    const groupQuestions = sectionQuestions.filter(
                      (question) => question.header_id === group.id,
                    );
                    if (!group.id && groupQuestions.length === 0) return null;
                    const key = group.id ?? section.id;
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          {editingHeaderId === group.id && group.id ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                className="h-7 w-48 text-xs"
                                value={editingHeaderName}
                                onChange={(e) => setEditingHeaderName(e.target.value)}
                              />
                              <Button
                                size="icon"
                                className="size-7"
                                onClick={() => saveHeaderName(group.id)}
                              >
                                <Check className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => setEditingHeaderId(null)}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                              {group.label}
                              {group.id && (
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setEditingHeaderId(group.id);
                                    setEditingHeaderName(group.label);
                                  }}
                                >
                                  <Pencil className="size-3" />
                                </button>
                              )}
                            </div>
                          )}

                          {group.id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive hover:bg-destructive/10"
                              title="حذف هذا العنوان"
                              onClick={() => deleteHeader(group.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {groupQuestions.map((question, questionIndex) => (
                            <QuestionRow
                              key={question.id}
                              question={question}
                              sections={tree!.sections}
                              headers={tree!.headers}
                              onSaved={refresh}
                              onMove={(direction) => {
                                const neighbour = groupQuestions[questionIndex + direction];
                                if (!neighbour) return;
                                swapOrder(
                                  "questions",
                                  "item_order",
                                  { id: question.id, order: question.item_order },
                                  { id: neighbour.id, order: neighbour.item_order },
                                );
                              }}
                              canMoveUp={questionIndex > 0}
                              canMoveDown={questionIndex < groupQuestions.length - 1}
                            />
                          ))}

                          <div className="flex flex-wrap items-end gap-2 pt-2">
                            <Input
                              className="flex-1 text-xs"
                              placeholder="إضافة بند أو سؤال تفتيش جديد..."
                              value={newQuestion[key] ?? ""}
                              onChange={(event) =>
                                setNewQuestion((prev) => ({ ...prev, [key]: event.target.value }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addQuestion(section.id, group.id)}
                            >
                              إضافة سؤال
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        },
      )}
    </fieldset>
  );
}

type QuestionRowProps = {
  question: {
    id: string;
    item_id: string;
    text_ar: string;
    max_score: number;
    active: boolean;
    section_id: string;
    header_id: string | null;
  };
  sections: { id: string; name_ar: string }[];
  headers: { id: string; label_ar: string; section_id: string }[];
  onSaved: () => void;
  onMove: (direction: 1 | -1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

function QuestionRow({
  question,
  sections,
  headers,
  onSaved,
  onMove,
  canMoveUp,
  canMoveDown,
}: QuestionRowProps) {
  const [text, setText] = useState(question.text_ar);
  const [maxScore, setMaxScore] = useState(String(question.max_score));
  const [sectionId, setSectionId] = useState(question.section_id);
  const [headerId, setHeaderId] = useState(question.header_id ?? "none");

  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const run = async (task: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await task();
    } catch {
      toast.error("تعذر حفظ التغيير؛ أعد المحاولة");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const dirty =
    text !== question.text_ar ||
    Number(maxScore) !== question.max_score ||
    sectionId !== question.section_id ||
    headerId !== (question.header_id ?? "none");

  const save = () =>
    run(async () => {
      const score = Number(maxScore);
      if (!text.trim() || !Number.isFinite(score) || score <= 0) {
        toast.error("تحقق من نص السؤال والدرجة القصوى");
        return;
      }
      if (
        !sections.some((section) => section.id === sectionId) ||
        (headerId !== "none" &&
          !headers.some((header) => header.id === headerId && header.section_id === sectionId))
      ) {
        toast.error("اختر قسمًا وعنوانًا تابعًا له قبل الحفظ");
        return;
      }
      const { error } = await supabase
        .from("questions")
        .update({
          text_ar: text.trim().slice(0, 500),
          max_score: score,
          section_id: sectionId,
          header_id: headerId === "none" ? null : headerId,
        })
        .eq("id", question.id)
        .select("id")
        .single();
      if (error) {
        toast.error("تعذر حفظ التعديل");
        return;
      }
      toast.success("تم الحفظ بنجاح");
      onSaved();
    });

  const deleteQuestion = () =>
    run(async () => {
      if (!confirm("هل أنت متأكد من حذف هذا السؤال نهائياً؟")) return;
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", question.id)
        .select("id")
        .single();
      if (error) {
        toast.error("تعذر حذف السؤال لوجود تقييمات سابقة مسجلة له");
        return;
      }
      toast.success("تم حذف السؤال");
      onSaved();
    });

  return (
    <fieldset
      disabled={busy}
      className="min-w-0 rounded-xl bg-card border border-border/70 p-3 shadow-xs space-y-2"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span dir="ltr" className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-[11px]">
          {question.item_id}
        </span>

        <div className="flex items-center gap-1" dir="ltr">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="أعلى"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="أسفل"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="size-3.5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:bg-destructive/10"
            title="حذف البند"
            onClick={deleteQuestion}
          >
            <Trash2 className="size-3.5" />
          </Button>

          <div className="flex items-center gap-1 mr-1">
            <Switch
              checked={question.active}
              onCheckedChange={(value) =>
                void run(async () => {
                  const { error } = await supabase
                    .from("questions")
                    .update({ active: value })
                    .eq("id", question.id)
                    .select("id")
                    .single();
                  if (error) throw error;
                  onSaved();
                })
              }
            />
            <span className="text-[10px]">{question.active ? "مفعل" : "معطل"}</span>
          </div>
        </div>
      </div>

      <Textarea
        className="text-xs"
        rows={2}
        aria-label="نص بند التفتيش"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">الدرجة:</span>
            <Input
              className="w-16 h-7 text-xs text-center"
              type="number"
              min={1}
              aria-label="الدرجة القصوى للبند"
              value={maxScore}
              onChange={(event) => setMaxScore(event.target.value)}
            />
          </div>

          <Select
            value={sectionId}
            onValueChange={(value) => {
              setSectionId(value);
              setHeaderId("none");
            }}
          >
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {sections.map((sec) => (
                <SelectItem key={sec.id} value={sec.id} className="text-xs">
                  {sec.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={headerId} onValueChange={setHeaderId}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="none" className="text-xs">
                بدون عنوان
              </SelectItem>
              {headers
                .filter((h) => h.section_id === sectionId)
                .map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">
                    {h.label_ar}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" className="h-7 text-xs gap-1" disabled={!dirty} onClick={save}>
          <Save className="size-3.5" /> حفظ التعديل
        </Button>
      </div>
    </fieldset>
  );
}

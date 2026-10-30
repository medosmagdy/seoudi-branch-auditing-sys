import { useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findingSchema, findingStatuses, severities, type Finding } from "@/lib/maintenance";
import { maintenancePhotoUrls, uploadMaintenancePhoto } from "@/lib/maintenance-data";
export const maintenanceSelect = "h-11 w-full rounded-lg border bg-background px-3 text-sm";
export function FindingEditor({
  initial,
  reportId,
  urls,
  onSave,
  onClose,
}: {
  initial: Finding;
  reportId: string;
  urls: Record<string, string>;
  onSave: (f: Finding) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const uploadLock = useRef(false);
  const set = <K extends keyof Finding>(key: K, value: Finding[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function upload(file: File) {
    if (uploadLock.current) return;
    uploadLock.current = true;
    setBusy(true);
    try {
      const path = await uploadMaintenancePhoto(reportId, file);
      const loaded = await maintenancePhotoUrls([path]);
      setLocalUrls((u) => ({ ...u, ...loaded }));
      setDraft((d) => ({ ...d, photos: [...d.photos, path] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>إضافة / تعديل ملاحظة</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            القسم
            <Input
              value={draft.section}
              maxLength={150}
              onChange={(e) => set("section", e.target.value)}
              list="maintenance-sections"
            />
            <datalist id="maintenance-sections">
              {[
                "الأسماك",
                "الجزارة",
                "البقالة",
                "الخباز",
                "الثلاجات والغرف",
                "صالة العرض",
                "تجهيز الفاكهة",
                "المخازن",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </datalist>
          </label>
          <label className="space-y-2">
            تاريخ العطل (يقبل شهر/سنة)
            <Input
              placeholder="9/2026"
              value={draft.initial_history}
              maxLength={100}
              onChange={(e) => set("initial_history", e.target.value)}
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            نقاط الصيانة
            <textarea
              className={maintenanceSelect + " min-h-24 py-3"}
              value={draft.description}
              maxLength={5000}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <label>
            الخطورة
            <select
              className={maintenanceSelect}
              value={draft.severity}
              onChange={(e) => set("severity", e.target.value as Finding["severity"])}
            >
              {Object.entries(severities).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            الحالة
            <select
              className={maintenanceSelect}
              value={draft.status}
              onChange={(e) => set("status", e.target.value as Finding["status"])}
            >
              {Object.entries(findingStatuses).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            المكلف بالتنفيذ
            <Input
              value={draft.assigned_to}
              maxLength={200}
              onChange={(e) => set("assigned_to", e.target.value)}
            />
          </label>
          <label>
            موعد الإغلاق المستهدف
            <Input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(e) => set("due_date", e.target.value || null)}
            />
          </label>
          {(
            [
              ["corrective_action", "الإجراء التصحيحي"],
              ["evidence", "أدلة (ميل / طلب شراء / وصف صورة التصحيح)"],
              ["comments", "تعليقات"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="sm:col-span-2">
              {l}
              <textarea
                className={maintenanceSelect + " min-h-20 py-2"}
                value={draft[k]}
                maxLength={5000}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm">صور الملاحظة وأدلة التصحيح (حتى 8 صور)</p>
            <div className="flex flex-wrap gap-3">
              {draft.photos.map((p, i) => (
                <div key={p}>
                  <img
                    src={localUrls[p] ?? urls[p]}
                    alt={`صورة الملاحظة ${i + 1}`}
                    className="h-28 w-32 rounded-lg object-contain"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      set(
                        "photos",
                        draft.photos.filter((x) => x !== p),
                      )
                    }
                  >
                    إزالة من الملاحظة
                  </Button>
                </div>
              ))}
            </div>
            <Input
              className="mt-3"
              aria-label="إضافة صورة"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || draft.photos.length >= 8}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              إزالة الصورة تخص هذه الملاحظة فقط وتحافظ على صور التقارير السابقة والنسخ الأخرى.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              const parsed = findingSchema.safeParse(draft);
              if (!parsed.success) {
                toast.error("راجع القسم ووصف الملاحظة والتواريخ");
                return;
              }
              onSave(parsed.data);
            }}
          >
            حفظ الملاحظة في التقرير
          </Button>
          <Button disabled={busy} variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
        {busy && <p role="status">جارٍ رفع الصورة…</p>}
      </DialogContent>
    </Dialog>
  );
}

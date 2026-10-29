import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { APP_SECTIONS, canSeeSection, type SectionOverrides } from "@/lib/app-sections";
import { saveSectionAccess } from "@/lib/section-access";
import type { AdminDirectoryUser } from "@/lib/admin-directory";
import { Button } from "@/components/ui/button";
export function SectionAccessManager({ users }: { users: AdminDirectoryUser[] }) {
  const access = useSectionAccess(),
    client = useQueryClient();
  const [userId, setUserId] = useState(""),
    [overrides, setOverrides] = useState<SectionOverrides>({}),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const user = users.find((u) => u.id === userId);
  const choose = (id: string) => {
    setUserId(id);
    setOverrides({ ...access.data?.users.find((u) => u.user_id === id)?.overrides });
  };
  const save = async () => {
    if (!user || user.role === "admin" || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await saveSectionAccess(user.id, overrides);
      await client.invalidateQueries({ queryKey: ["section-access"] });
      toast.success("تم حفظ ظهور السكاشن للمستخدم");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="surface-card space-y-4 p-5" aria-labelledby="section-access-title">
      <div>
        <h2 id="section-access-title" className="font-bold">
          ظهور السكاشن للمستخدمين
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          حدد السكاشن الظاهرة لكل مستخدم. إخفاء السكشن يمنع فتحه بالرابط داخل التطبيق. صلاحيات تعديل
          الأوديتس والمشاركة تظل كما هي. إظهار المجازر يتيح كل عملياته: إضافة وتعديل وحذف التقارير
          والتصدير.
        </p>
      </div>
      {access.isError ? (
        <>
          <p role="alert">تعذر تحميل الإعدادات</p>
          <Button onClick={() => void access.refetch()}>إعادة المحاولة</Button>
        </>
      ) : !access.data?.installed ? (
        <p>الميزة جاهزة وتحتاج تفعيل إضافة الداتابيز بعد الموافقة عليها.</p>
      ) : (
        <>
          <label className="block text-sm">
            المستخدم
            <select
              className="mt-2 block min-h-11 w-full rounded-lg border bg-card px-3"
              value={userId}
              disabled={busy}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">اختر المستخدم</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                  {u.role === "admin" ? " — مدير النظام" : ""}
                </option>
              ))}
            </select>
          </label>
          {user?.role === "admin" ? (
            <p>مدير النظام يرى كل السكاشن دائمًا، وصلاحية الإدارة لا تتغير من هنا.</p>
          ) : (
            user && (
              <fieldset disabled={busy} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {APP_SECTIONS.map((s) => (
                    <label
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <span className="text-sm">
                        {s.label}
                        <small className="mt-1 block text-muted-foreground">
                          الحالي: {canSeeSection(user.role, s.id, overrides) ? "ظاهر" : "مخفي"}
                        </small>
                      </span>
                      <select
                        aria-label={`ظهور ${s.label}`}
                        className="min-h-10 rounded border bg-card px-2"
                        value={overrides[s.id] === undefined ? "default" : String(overrides[s.id])}
                        onChange={(e) =>
                          setOverrides((prev) => {
                            const next = { ...prev };
                            if (e.target.value === "default") delete next[s.id];
                            else next[s.id] = e.target.value === "true";
                            return next;
                          })
                        }
                      >
                        <option value="default">حسب الرتبة</option>
                        <option
                          value="true"
                          disabled={
                            user.role === "auditor" &&
                            (s.id === "branches" || s.id === "warehouses")
                          }
                        >
                          ظاهر
                        </option>
                        <option value="false">مخفي</option>
                      </select>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void save()}>
                    {busy ? "جارٍ الحفظ…" : "حفظ ظهور السكاشن"}
                  </Button>
                  <Button variant="outline" onClick={() => setOverrides({})}>
                    إرجاع الاختيارات حسب الرتبة
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  التغيير يصل للمستخدم عند تحديث الصفحة أو خلال نحو 30 ثانية. الإدارة متاحة لمدير
                  النظام فقط.
                </p>
              </fieldset>
            )
          )}
        </>
      )}
    </section>
  );
}

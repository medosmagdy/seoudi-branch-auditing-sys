import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuditSharing } from "@/hooks/useAuditSharing";
import { saveManagerBranchScope } from "@/lib/audit-sharing";
import type { AdminDirectoryUser } from "@/lib/admin-directory";
import { Button } from "@/components/ui/button";
import { readAllPages } from "@/lib/query-pages";

export function ManagerBranchAccess({ users }: { users: AdminDirectoryUser[] }) {
  const sharing = useAuditSharing();
  const client = useQueryClient();
  const lock = useRef(false);
  const [user, setUser] = useState("");
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const branches = useQuery({
    queryKey: ["manager-scope-branches"],
    queryFn: ({ signal }) =>
      readAllPages(
        (from, to) =>
          supabase
            .from("branches")
            .select("id,name_ar")
            .order("name_ar")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
    enabled: sharing.data?.branch_scoping_installed === true,
  });
  const choose = (id: string) => {
    const saved = sharing.data?.manager_scopes.find((scope) => scope.user_id === id);
    setUser(id);
    setAll(!saved);
    setSelected(saved?.branch_ids ?? []);
  };
  const save = async () => {
    if (lock.current || !user) return;
    lock.current = true;
    setBusy(true);
    try {
      await saveManagerBranchScope(user, all ? null : selected);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["audit-sharing"] }),
        client.invalidateQueries({ queryKey: ["audits"] }),
        client.invalidateQueries({ queryKey: ["audit-access"] }),
        client.invalidateQueries({ queryKey: ["dashboard-data-full"] }),
      ]);
      toast.success("تم حفظ الفروع المتاحة للمشرف");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الفروع");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="surface-card space-y-4 p-5" aria-labelledby="manager-branches-title">
      <div>
        <h2 id="manager-branches-title" className="font-bold">
          الفروع المتاحة للمشرفين
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          حدد الفروع التي يشاهد المشرف أوديتسها المعتمدة. أوديتاته الخاصة ومجموعات المشاركة تظل
          متاحة من سجل الفحوصات.
        </p>
      </div>
      {!sharing.data?.branch_scoping_installed ? (
        <p>إعداد تحديد الفروع يحتاج تفعيل إضافة الداتابيز بعد الموافقة عليها.</p>
      ) : (
        <>
          <label className="block text-sm">
            المشرف
            <select
              className="mt-2 block min-h-11 w-full rounded-lg border bg-card px-3"
              value={user}
              disabled={busy}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">اختر المشرف</option>
              {users
                .filter((u) => u.role === "manager")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
            </select>
          </label>
          {!users.some((u) => u.role === "manager") && (
            <p className="text-sm text-muted-foreground">
              لا توجد حسابات برتبة مشرف حاليًا. عند تعيين مشرف سيظهر هنا.
            </p>
          )}
          {user && (
            <fieldset
              disabled={busy || branches.isPending || branches.isError}
              className="space-y-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                السماح بكل الفروع والمخازن
              </label>
              {!all && (
                <>
                  <p className="text-xs text-muted-foreground">
                    الفروع المحددة فقط. ترك الاختيارات فارغة يمنع عرض معتمد الآخرين من أي فرع.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {branches.data?.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(branch.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked
                                ? [...prev, branch.id]
                                : prev.filter((id) => id !== branch.id),
                            )
                          }
                        />
                        {branch.name_ar}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <Button onClick={() => void save()}>
                {busy ? "جاري الحفظ…" : "حفظ صلاحيات الفروع"}
              </Button>
            </fieldset>
          )}
          {branches.isError && (
            <p role="alert">
              تعذر تحميل الفروع.{" "}
              <Button onClick={() => void branches.refetch()}>إعادة المحاولة</Button>
            </p>
          )}
        </>
      )}
    </section>
  );
}

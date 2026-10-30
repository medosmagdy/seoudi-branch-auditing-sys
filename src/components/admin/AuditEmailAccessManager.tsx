import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadAdminDirectory } from "@/lib/admin-directory";
import {
  loadAuditEmailAccess,
  saveAuditEmailAccess,
  type EmailAccessSettings,
} from "@/lib/audit-email-access";
const labels = { admin: "مديرو النظام", manager: "المشرفون", auditor: "المراقبون" } as const;
export function AuditEmailAccessManager() {
  const access = useQuery({ queryKey: ["audit-email-access"], queryFn: loadAuditEmailAccess });
  const users = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: ({ signal }) => loadAdminDirectory(signal),
  });
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <h3 className="font-bold">مين يقدر يجهّز إيميل التقرير؟</h3>
      <p className="text-sm text-muted-foreground">
        اختار رتبة أو أكثر، أو أشخاص محددين. الشخص المضاف يقدر يجهّز الميل حتى لو رتبته مش مختارة،
        بشرط يكون له وصول للأوديت المعتمد. ده لا يغيّر صلاحيات مشاهدة الأوديتس.
      </p>
      {access.isPending || users.isPending ? (
        <p>جارٍ تحميل الصلاحيات…</p>
      ) : access.isError || users.isError ? (
        <p role="alert">
          تعذر تحميل الصلاحيات.{" "}
          <Button
            variant="outline"
            onClick={() => {
              void access.refetch();
              void users.refetch();
            }}
          >
            إعادة المحاولة
          </Button>
        </p>
      ) : !access.data.installed ? (
        <p>تفعيل تحكم ظهور الزر يحتاج إضافة الداتابيز المقترحة.</p>
      ) : (
        <Editor
          key={JSON.stringify([access.data.roles, access.data.user_ids])}
          initial={{ roles: access.data.roles ?? [], user_ids: access.data.user_ids ?? [] }}
          users={users.data}
        />
      )}
    </div>
  );
}
function Editor({
  initial,
  users,
}: {
  initial: EmailAccessSettings;
  users: Awaited<ReturnType<typeof loadAdminDirectory>>;
}) {
  const [config, setConfig] = useState(() => ({
      ...initial,
      user_ids: initial.user_ids.filter((id) => users.some((u) => u.id === id)),
    })),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const lock = useRef(false),
    client = useQueryClient();
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await saveAuditEmailAccess(config);
      await client.invalidateQueries({ queryKey: ["audit-email-access"] });
      toast.success("تم حفظ صلاحية تجهيز الميل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ الصلاحيات");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-semibold">الرتب المسموح لها</legend>
        <div className="flex flex-wrap gap-4">
          {Object.entries(labels).map(([id, label]) => (
            <label key={id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.roles.includes(id as keyof typeof labels)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    roles: e.target.checked
                      ? [...c.roles, id as keyof typeof labels]
                      : c.roles.filter((x) => x !== id),
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-semibold">أشخاص إضافيون</legend>
        <input
          className="mb-2 w-full rounded-lg border bg-background p-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المستخدم"
          aria-label="بحث المستخدمين"
        />
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-background p-3">
          {users
            .filter((u) => (u.full_name || u.email).toLowerCase().includes(search.toLowerCase()))
            .map((u) => (
              <label className="flex items-center gap-2 text-sm" key={u.id}>
                <input
                  type="checkbox"
                  checked={config.user_ids.includes(u.id)}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      user_ids: e.target.checked
                        ? [...c.user_ids, u.id]
                        : c.user_ids.filter((x) => x !== u.id),
                    }))
                  }
                />
                {u.full_name || u.email}{" "}
                <span className="text-muted-foreground">({labels[u.role]})</span>
              </label>
            ))}
        </div>
      </fieldset>
      {!config.roles.length && !config.user_ids.length && (
        <p className="text-sm text-amber-700">
          الزر هيكون مخفي عن الجميع، بما فيهم مديري النظام، لحين تعديل الإعداد.
        </p>
      )}
      <Button disabled={busy} onClick={() => void save()}>
        حفظ صلاحية تجهيز الميل
      </Button>
    </div>
  );
}

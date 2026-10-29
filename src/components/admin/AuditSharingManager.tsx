import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuditSharing } from "@/hooks/useAuditSharing";
import {
  deleteAuditShareGroup,
  saveAuditShareGroup,
  type AuditShareGroup,
} from "@/lib/audit-sharing";
import type { AdminDirectoryUser } from "@/lib/admin-directory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuditSharingManager({ users }: { users: AdminDirectoryUser[] }) {
  const sharing = useAuditSharing();
  const client = useQueryClient();
  const lock = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const reset = () => {
    setEditing(null);
    setName("");
    setMembers([]);
    setDeleteId(null);
  };
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["audit-sharing"] }),
      client.invalidateQueries({ queryKey: ["audits"] }),
      client.invalidateQueries({ queryKey: ["audit-access"] }),
    ]);
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await saveAuditShareGroup(editing, name, members);
      reset();
      await refresh();
      toast.success("تم حفظ مجموعة المشاركة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ المجموعة");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleteId || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteAuditShareGroup(deleteId);
      reset();
      await refresh();
      toast.success("تم إلغاء مجموعة المشاركة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إلغاء المجموعة");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const edit = (group: AuditShareGroup) => {
    setEditing(group.id);
    setName(group.name);
    setMembers(group.member_ids);
    setDeleteId(null);
  };
  return (
    <section className="surface-card space-y-4 p-5" aria-labelledby="audit-sharing-title">
      <div>
        <h2 id="audit-sharing-title" className="font-bold">
          مجموعات مشاركة الأوديتس
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          الأعضاء يشاهدون ويعدّلون أوديتس بعض، بما فيها المسودات. المشاركة لا تغيّر الرتبة ولا تمنح
          حذف أوديتات الآخرين أو إدارة الحسابات.
        </p>
      </div>
      {sharing.isPending ? (
        <p role="status">جاري تحميل المجموعات…</p>
      ) : sharing.isError ? (
        <div role="alert">
          تعذر تحميل المجموعات.{" "}
          <Button onClick={() => void sharing.refetch()}>إعادة المحاولة</Button>
        </div>
      ) : !sharing.data?.installed ? (
        <p role="status">
          إعداد المشاركة غير مفعّل بعد. يلزم تطبيق إضافة الداتابيز بعد مراجعتها والموافقة عليها.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {sharing.data.groups.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.member_ids
                      .map((id) => users.find((u) => u.id === id)?.full_name || "حساب غير متاح")
                      .join("، ")}
                  </p>
                </div>
                <Button variant="outline" disabled={busy} onClick={() => edit(group)}>
                  تعديل الأعضاء
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setDeleteId(group.id)}>
                  إلغاء المشاركة
                </Button>
              </div>
            ))}
          </div>
          {deleteId && (
            <div role="alert" className="rounded-xl border border-destructive/30 p-4">
              <p>
                إلغاء المجموعة يوقف المشاركة بين أعضائها، مع استمرار أي مشاركة تمنحها مجموعة أخرى.
                لن تُحذف الأوديتس.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
                  تأكيد إلغاء المجموعة
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>
                  تراجع
                </Button>
              </div>
            </div>
          )}
          <fieldset disabled={busy} className="space-y-4 rounded-xl border p-4">
            <legend className="px-2 font-semibold">
              {editing ? "تعديل مجموعة المشاركة" : "مجموعة مشاركة جديدة"}
            </legend>
            <label className="block text-sm">
              اسم المجموعة
              <Input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                className="mt-2"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={members.includes(user.id)}
                    onChange={(e) =>
                      setMembers((prev) =>
                        e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id),
                      )
                    }
                  />
                  {user.full_name || user.email}
                </label>
              ))}
            </div>
            {members
              .filter((id) => !users.some((user) => user.id === id))
              .map((id) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>حساب غير متاح ضمن أعضاء المجموعة</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMembers((previous) => previous.filter((member) => member !== id))
                    }
                  >
                    إزالة العضو غير المتاح
                  </Button>
                </div>
              ))}
            <p className="text-xs text-muted-foreground">
              اختر عضوين أو أكثر. إزالة عضو تسحب وصوله المشترك بعد تحديث الصلاحيات، ولا تغيّر ملكية
              الأوديتس.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || members.length < 2 || !name.trim()}
                onClick={() => void save()}
              >
                {busy ? "جاري الحفظ…" : "حفظ المشاركة"}
              </Button>
              {editing && (
                <Button variant="outline" disabled={busy} onClick={reset}>
                  إلغاء التعديل
                </Button>
              )}
            </div>
          </fieldset>
        </>
      )}
    </section>
  );
}

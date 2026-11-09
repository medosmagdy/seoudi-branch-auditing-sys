import { useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { newPasswordSchema } from "@/lib/auth-flow";
import { setUserPasswordServerFn } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export function UserPasswordDialog({
  user,
}: {
  user: { id: string; full_name: string | null; email: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  function close(next: boolean) {
    if (lock.current) return;
    setOpen(next);
    if (!next) {
      setPassword("");
      setConfirmation("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const parsed = newPasswordSchema.safeParse(password);
    if (!parsed.success || password !== confirmation) {
      toast.error(
        !parsed.success
          ? (parsed.error.issues[0]?.message ?? "كلمة المرور غير صالحة")
          : "كلمتا المرور غير متطابقتين",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("سجّل الدخول مرة أخرى");
      await setUserPasswordServerFn({
        data: { userId: user.id, password: parsed.data },
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      setOpen(false);
      setPassword("");
      setConfirmation("");
      toast.success("تم تعيين كلمة المرور الجديدة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تعيين كلمة المرور");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`تعيين كلمة مرور لـ ${user.full_name || user.email}`}
        >
          <KeyRound className="size-4" /> كلمة مرور جديدة
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعيين كلمة مرور جديدة</DialogTitle>
          <DialogDescription>
            {user.full_name} <bdi>{user.email}</bdi>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            كلمة المرور الجديدة
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              required
              disabled={busy}
            />
          </label>
          <label className="block space-y-1">
            تأكيد كلمة المرور
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "جاري الحفظ…" : "تعيين كلمة المرور"}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => close(false)}>
            إلغاء
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

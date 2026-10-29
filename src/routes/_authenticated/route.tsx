import { useSession } from "@/hooks/useSession";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // 1. قراءة الجلسة المخزنة محلياً في الـ LocalStorage أولاً (فورية مع الريفريش)
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session?.user) {
      throw redirect({ to: "/auth" });
    }

    // 2. الجلسة صالحة وموجودة محلياً
    return {
      user: sessionData.session.user,
      session: sessionData.session,
    };
  },
  component: AuthenticatedLayout,
});
function AuthenticatedLayout() {
  const { profile, isLoading, error, refresh } = useSession();
  if (isLoading)
    return (
      <AppShell title="جارٍ تجهيز حسابك">
        <div
          role="status"
          className="surface-card flex items-center justify-center gap-3 rounded-xl border p-12 text-sm text-muted-foreground"
        >
          <Loader2 className="size-5 animate-spin" /> جارٍ التحقق من الحساب والصلاحيات…
        </div>
      </AppShell>
    );
  if (!profile || error)
    return (
      <AppShell title="تعذر تحميل الحساب">
        <div role="alert" className="surface-card space-y-3 rounded-xl border p-8 text-center">
          <p>{error || "الجلسة غير متاحة؛ سجّل الدخول مرة أخرى"}</p>
          <Button onClick={() => void refresh()}>إعادة المحاولة</Button>
        </div>
      </AppShell>
    );
  if (!profile.active)
    return (
      <AppShell title="الحساب غير مفعل">
        <div role="alert" className="surface-card space-y-2 rounded-xl border p-8 text-center">
          <h1 className="font-semibold">حسابك موقوف حاليًا</h1>
          <p className="text-sm text-muted-foreground">تواصل مع مسؤول النظام لتفعيل الحساب.</p>
        </div>
      </AppShell>
    );
  return <Outlet />;
}

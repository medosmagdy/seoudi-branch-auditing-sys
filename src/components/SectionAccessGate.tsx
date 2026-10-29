import { useSession } from "@/hooks/useSession";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSectionAccess } from "@/hooks/useSectionAccess";
import { sectionForRoute } from "@/lib/app-sections";
import { AppShell } from "./AppShell";
import { Button } from "./ui/button";
export function SectionAccessGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useRouterState({ select: (s) => s.location });
  const access = useSectionAccess();
  const { profile } = useSession();
  const section = sectionForRoute(pathname, search.scope);
  if (!section || profile?.role === "admin") return children;
  if (access.isPending)
    return (
      <AppShell title="جارٍ التحقق من صلاحيات السكاشن">
        <p role="status">جارٍ التحميل…</p>
      </AppShell>
    );
  if (access.isError)
    return (
      <AppShell title="تعذر التحقق من الصلاحيات">
        <p role="alert">تعذر تحميل صلاحيات السكاشن.</p>
        <Button onClick={() => void access.refetch()}>إعادة المحاولة</Button>
      </AppShell>
    );
  if (!access.canSee(section))
    return (
      <AppShell title="السكشن غير متاح">
        <p role="alert">السكشن ده غير متاح لحسابك. تواصل مع مدير النظام لتعديل صلاحيات الظهور.</p>
      </AppShell>
    );
  return children;
}

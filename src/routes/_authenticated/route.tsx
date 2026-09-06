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
      session: sessionData.session
    };
  },
  component: () => <Outlet />,
});
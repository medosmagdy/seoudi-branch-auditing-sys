import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, ShieldCheck, Warehouse } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const navItems = [
  { to: "/dashboard", label: "الفروع", icon: LayoutDashboard, search: { scope: "branches" } },
  { to: "/dashboard", label: "المخازن", icon: Warehouse, search: { scope: "warehouses" } },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { profile, isAdmin } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const currentScope = search.scope === "warehouses" ? "warehouses" : "branches";

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="brand-banner sticky top-0 z-30 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground font-bold">S</span>
            <span className="text-sm font-semibold leading-tight">
              Seoudi Auditing System
              <span className="block text-[11px] font-normal opacity-80">SAS</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/audits" className={cn("rounded-lg px-3 py-2 text-sm transition-colors", pathname === "/audits" ? "bg-secondary text-secondary-foreground font-semibold" : "hover:bg-primary-soft/60")}>سجل الفحوصات</Link>
            {isAdmin && <Link to="/admin" className={cn("rounded-lg px-3 py-2 text-sm transition-colors", pathname.startsWith("/admin") ? "bg-secondary text-secondary-foreground font-semibold" : "hover:bg-primary-soft/60")}>الإدارة</Link>}
            <Button variant="ghost" size="sm" onClick={signOut} className="hover:bg-primary-soft/60" aria-label="تسجيل الخروج">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)] flex-row">
        <aside className="w-64 shrink-0 border-l border-border bg-card px-3 py-5">
          <div className="mb-4 px-3 text-xs font-bold text-muted-foreground">القائمة الرئيسية</div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link key={`${item.to}-${item.label}`} to={item.to} search={item.search}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors", pathname === item.to && item.search.scope === (location.search.includes("warehouses") ? "warehouses" : "branches") ? "bg-secondary text-secondary-foreground font-semibold" : "hover:bg-primary-soft/60")}>
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-8 px-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />{profile?.full_name || profile?.email} · {isAdmin ? "Administrator" : "Auditor"}</span>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {(title || action) && <div className="border-b border-border bg-card"><div className="flex flex-wrap items-center gap-3 px-6 py-4"><div>{title && <h1 className="text-lg font-bold sm:text-xl">{title}</h1>}{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}</div><div className="mr-auto flex items-center gap-2">{action}</div></div></div>}
          <main className="mx-auto max-w-6xl px-4 py-5 pb-24">{children}</main>
        </div>
      </div>
    </div>
  );
}

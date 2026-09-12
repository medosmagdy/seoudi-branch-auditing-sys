import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/audits", label: "Audits", icon: ClipboardList },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background" dir="ltr">
      <header className="brand-banner sticky top-0 z-30 shadow-[var(--shadow-card)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground font-bold">
              S
            </span>
            <span className="hidden text-sm font-semibold leading-tight sm:block">
              Seoudi Auditing System
              <span className="block text-[11px] font-normal opacity-80">SAS</span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname.startsWith(item.to)
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "hover:bg-primary-soft/60"
                )}
              >
                <item.icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}

            {isAdmin && (
              <Link
                to="/admin"
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "hover:bg-primary-soft/60"
                )}
              >
                <Settings className="size-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="hover:bg-primary-soft/60"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>

      {(title || action) && (
        <div className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
            <div>
              {title && <h1 className="text-lg font-bold sm:text-xl">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2">{action}</div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24">{children}</main>

      <footer className="no-print border-t border-border py-4 text-center text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3.5" />
          {profile?.full_name || profile?.email} · {isAdmin ? "Administrator" : "Auditor"}
        </span>
      </footer>
    </div>
  );
}

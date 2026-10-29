import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppNavigation } from "@/components/AppNavigation";
import { useState, useRef, type ReactNode } from "react";
import { toast } from "sonner";

export function AppShell({
  children,
  title,
  subtitle,
  action,
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  contentClassName?: string;
}) {
  const { profile, isAdmin } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const signOutLock = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useRouterState({ select: (state) => state.location });

  const signOut = async () => {
    if (signOutLock.current) return;
    signOutLock.current = true;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
      await navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("تعذر تسجيل الخروج؛ أعد المحاولة");
    } finally {
      signOutLock.current = false;
      setSigningOut(false);
    }
  };

  return (
    <div className="app-shell min-h-screen bg-background" dir="rtl">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:shadow-lg"
      >
        تخطي إلى المحتوى
      </a>
      <header className="brand-banner sticky top-0 z-30 shadow-[var(--shadow-card)]">
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap"
          dir="ltr"
        >
          <Link
            to={profile?.role === "auditor" ? "/audits" : "/dashboard"}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <img
              src="/quality-assurance-logo.png"
              alt="Seoudi Quality Assurance"
              className="h-14 w-24 object-contain mix-blend-multiply"
            />
            <span className="hidden text-sm font-semibold leading-tight sm:block">
              Seoudi Quality Operating Platform
              <span className="block text-[11px] font-normal opacity-80">SQOP</span>
            </span>
          </Link>
          <div className="flex items-center gap-2" dir="rtl">
            {isAdmin && (
              <Link
                to="/admin"
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "hover:bg-primary-soft/60",
                )}
              >
                الإدارة
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              disabled={signingOut}
              className="hover:bg-primary-soft/60"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">
                {signingOut ? "جارٍ الخروج…" : "تسجيل الخروج"}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)] flex-col md:flex-row">
        <AppNavigation profile={profile} isAdmin={isAdmin} />

        <div className="min-w-0 flex-1">
          {(title || action) && (
            <div className="shell-page-heading border-b border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div>
                  {title && <h1 className="text-lg font-bold sm:text-xl">{title}</h1>}
                  {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="mr-auto flex items-center gap-2">{action}</div>
              </div>
            </div>
          )}
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "app-content mx-auto max-w-6xl px-4 py-5 pb-24 outline-none",
              contentClassName,
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

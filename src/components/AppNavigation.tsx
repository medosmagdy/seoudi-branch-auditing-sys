import { useSectionAccess } from "@/hooks/useSectionAccess";
import { sectionForRoute } from "@/lib/app-sections";
import { navigationAccess } from "@/lib/navigation";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Warehouse,
  PackageSearch,
  FilePlus2,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { useSession } from "@/hooks/useSession";

type SessionProfile = ReturnType<typeof useSession>["profile"];

const navItems = [
  { to: "/audits/new", label: "بدء فحص", icon: FilePlus2, search: {} },
  { to: "/audits", label: "سجل الفحوصات", icon: ClipboardCheck, search: {} },
  { to: "/slaughtering", label: "المجازر", icon: ClipboardCheck, search: {} },
  { to: "/dashboard", label: "الفروع", icon: LayoutDashboard, search: { scope: "branches" } },
  { to: "/dashboard", label: "المخازن", icon: Warehouse, search: { scope: "warehouses" } },
  { to: "/expiry", label: "تسجيل الإكسبيرات", icon: PackageSearch, search: {} },
  { to: "/admin", label: "الإدارة", icon: Settings, search: {} },
] as const;

export function AppNavigation({ profile, isAdmin }: { profile: SessionProfile; isAdmin: boolean }) {
  const sections = useSectionAccess();
  const [collapsed, setCollapsed] = useState(false);
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const currentScope = search.scope === "warehouses" ? "warehouses" : "branches";

  return (
    <aside
      className={cn(
        "app-navigation flex w-full shrink-0 flex-col border-b border-border bg-card px-3 py-4 transition-[width] md:border-b-0 md:border-l md:py-5",
        collapsed ? "md:w-20" : "md:w-64",
      )}
    >
      <div
        className={cn(
          "mb-4 flex items-center px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <span className="text-xs font-bold text-muted-foreground">القائمة الرئيسية</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted md:inline-flex"
          aria-expanded={!collapsed}
          aria-controls="app-primary-navigation"
          aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <nav
        id="app-primary-navigation"
        className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
        aria-label="القائمة الرئيسية"
      >
        {navItems.map((item) => {
          const section = sectionForRoute(
            item.to,
            "scope" in item.search ? item.search.scope : undefined,
          );
          if (section && !sections.canSee(section)) return null;
          const access =
            item.to === "/slaughtering"
              ? { allowed: true, reason: "" }
              : navigationAccess(profile, item.to);
          if (item.to === "/admin" && !isAdmin) return null;
          const isDisabled = !access.allowed;
          const routeActive =
            item.to === "/audits"
              ? pathname.startsWith("/audits") && pathname !== "/audits/new"
              : pathname === item.to;
          const active =
            routeActive && ("scope" in item.search ? item.search.scope === currentScope : true);
          const className = cn(
            "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-sm transition-colors md:shrink",
            isDisabled
              ? "cursor-not-allowed opacity-50"
              : active
                ? "bg-secondary text-secondary-foreground font-semibold"
                : "hover:bg-primary-soft/60",
          );
          return isDisabled ? (
            <div
              key={`${item.to}-${item.label}`}
              className={className}
              aria-disabled="true"
              title={access.reason}
              aria-label={`${item.label} — ${access.reason}`}
            >
              <item.icon className="size-4" />
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
            </div>
          ) : (
            <Link
              key={`${item.to}-${item.label}`}
              to={item.to}
              search={item.search}
              className={className}
              preload="intent"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-4" />
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-3 pt-8 text-xs text-muted-foreground md:block">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3.5" />
          {profile?.full_name || profile?.email} ·{" "}
          {isAdmin ? "Administrator" : profile?.role === "manager" ? "Manager" : "Auditor"}
        </span>
      </div>
    </aside>
  );
}

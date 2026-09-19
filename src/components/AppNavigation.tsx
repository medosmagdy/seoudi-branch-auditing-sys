import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShieldCheck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { useSession } from "@/hooks/useSession";

type SessionProfile = ReturnType<typeof useSession>["profile"];

const navItems = [
  { to: "/dashboard", label: "الفروع", icon: LayoutDashboard, search: { scope: "branches" } },
  { to: "/dashboard", label: "المخازن", icon: Warehouse, search: { scope: "warehouses" } },
] as const;

export function AppNavigation({ profile, isAdmin }: { profile: SessionProfile; isAdmin: boolean }) {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const currentScope = search.scope === "warehouses" ? "warehouses" : "branches";

  return (
    <aside className="w-64 shrink-0 border-l border-border bg-card px-3 py-5">
      <div className="mb-4 px-3 text-xs font-bold text-muted-foreground">القائمة الرئيسية</div>
      <nav className="flex flex-col gap-1" aria-label="القائمة الرئيسية">
        {navItems.map((item) => (
          <Link
            key={`${item.to}-${item.label}`}
            to={item.to}
            search={item.search}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
              pathname === item.to && item.search.scope === currentScope
                ? "bg-secondary text-secondary-foreground font-semibold"
                : "hover:bg-primary-soft/60",
            )}
          >
            <item.icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto px-3 pt-8 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3.5" />
          {profile?.full_name || profile?.email} · {isAdmin ? "Administrator" : "Auditor"}
        </span>
      </div>
    </aside>
  );
}

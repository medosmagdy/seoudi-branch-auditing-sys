import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, LayoutDashboard, ShieldCheck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { useSession } from "@/hooks/useSession";

type SessionProfile = ReturnType<typeof useSession>["profile"];

const navItems = [
  { to: "/slaughtering", label: "المجازر", icon: ClipboardCheck, search: {} },
  { to: "/dashboard", label: "الفروع", icon: LayoutDashboard, search: { scope: "branches" } },
  { to: "/dashboard", label: "المخازن", icon: Warehouse, search: { scope: "warehouses" } },
] as const;

export function AppNavigation({ profile, isAdmin }: { profile: SessionProfile; isAdmin: boolean }) {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const currentScope = search.scope === "warehouses" ? "warehouses" : "branches";

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card px-3 py-4 md:w-64 md:border-b-0 md:border-l md:py-5">
      <div className="mb-4 px-3 text-xs font-bold text-muted-foreground">القائمة الرئيسية</div>
      <nav className="flex flex-col gap-1" aria-label="القائمة الرئيسية">
        {navItems.map((item) => {
          const isDisabled = item.to === "/slaughtering" && !isAdmin;
          const className = cn(
            "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
            isDisabled ? "cursor-not-allowed opacity-50" : pathname === item.to && ("scope" in item.search ? item.search.scope === currentScope : true)
              ? "bg-secondary text-secondary-foreground font-semibold"
              : "hover:bg-primary-soft/60",
          );
          return isDisabled ? (
            <div key={`${item.to}-${item.label}`} className={className} aria-disabled="true" title="متاح لمدير النظام فقط">
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </div>
          ) : (
            <Link key={`${item.to}-${item.label}`} to={item.to} search={item.search} className={className}>
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
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

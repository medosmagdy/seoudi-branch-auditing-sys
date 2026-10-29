import type { AppRole } from "./permissions";
// One registry drives navigation, direct-link guards and the administration form.
export const APP_SECTIONS = [
  {
    id: "audits",
    label: "الأوديتس وبدء الفحص",
    path: "/audits",
    roles: ["admin", "manager", "auditor"],
  },
  { id: "slaughtering", label: "المجازر", path: "/slaughtering", roles: ["admin"] },
  {
    id: "branches",
    label: "الفروع والمتابعة الشهرية",
    path: "/dashboard",
    scope: "branches",
    roles: ["admin", "manager"],
  },
  {
    id: "warehouses",
    label: "المخازن",
    path: "/dashboard",
    scope: "warehouses",
    roles: ["admin", "manager"],
  },
  {
    id: "expiry",
    label: "تسجيل الإكسبيرات",
    path: "/expiry",
    roles: ["admin", "manager", "auditor"],
  },
] as const;
export type SectionId = (typeof APP_SECTIONS)[number]["id"];
export type SectionOverrides = Partial<Record<SectionId, boolean>>;
export function sectionForRoute(path: string, scope?: unknown): SectionId | null {
  const section = APP_SECTIONS.find(
    (s) =>
      (path === s.path || path.startsWith(s.path + "/")) &&
      (!("scope" in s) || s.scope === (scope === "warehouses" ? "warehouses" : "branches")),
  );
  return section?.id ?? null;
}
export function canSeeSection(role: AppRole, id: SectionId, overrides: SectionOverrides = {}) {
  if (role === "admin") return true;
  if ((id === "branches" || id === "warehouses") && role === "auditor") return false;
  if (typeof overrides[id] === "boolean") return overrides[id]!;
  return (APP_SECTIONS.find((s) => s.id === id)!.roles as readonly string[]).includes(role);
}

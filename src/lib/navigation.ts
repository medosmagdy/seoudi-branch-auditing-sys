import type { AppRole } from "./permissions";
export function navigationAccess(profile: { role: AppRole; active: boolean } | null, path: string) {
  if (!profile?.active) return { allowed: false, reason: "الحساب غير متاح حاليًا" };
  if (path === "/slaughtering" || path === "/admin")
    return { allowed: profile.role === "admin", reason: "متاح لمدير النظام فقط" };
  if (path === "/dashboard")
    return {
      allowed: profile.role === "admin" || profile.role === "manager",
      reason: "متاح للإدارة والمشرفين فقط",
    };
  return { allowed: true, reason: "" };
}

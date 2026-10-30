import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
const roles = z.enum(["admin", "manager", "auditor"]);
const schema = z.object({
  allowed: z.boolean(),
  roles: z.array(roles).nullable(),
  user_ids: z.array(z.string().uuid()).nullable(),
});
export type EmailAccessSettings = {
  roles: ("admin" | "manager" | "auditor")[];
  user_ids: string[];
};
async function rpc(name: string, args?: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);
}
export async function loadAuditEmailAccess() {
  const { data, error } = await rpc("sqop_audit_email_access_context");
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? ""))
      return { installed: false, allowed: true, roles: null, user_ids: null };
    throw new Error("تعذر التحقق من صلاحية تجهيز الميل");
  }
  return { installed: true, ...schema.parse(data) };
}
export async function saveAuditEmailAccess(settings: EmailAccessSettings) {
  z.object({ roles: z.array(roles).max(3), user_ids: z.array(z.string().uuid()).max(500) }).parse(
    settings,
  );
  const { error } = await rpc("sqop_set_audit_email_access", {
    p_roles: settings.roles,
    p_users: settings.user_ids,
  });
  if (error) throw new Error(error.message);
}

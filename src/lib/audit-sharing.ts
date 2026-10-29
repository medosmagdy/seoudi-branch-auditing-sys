import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const groupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  member_ids: z.array(z.string().uuid()),
});
const contextSchema = z.object({
  peers: z.array(z.string().uuid()),
  groups: z.array(groupSchema),
  visible_branch_ids: z.array(z.string().uuid()).nullable().default(null),
  branch_scoping_installed: z.boolean().default(false),
  manager_scopes: z
    .array(z.object({ user_id: z.string().uuid(), branch_ids: z.array(z.string().uuid()) }))
    .default([]),
});
export type AuditShareGroup = z.infer<typeof groupSchema>;
export type AuditSharing = z.infer<typeof contextSchema> & { installed: boolean };
export const EMPTY_SHARED_USERS: string[] = [];
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
export async function loadAuditSharing(): Promise<AuditSharing> {
  const { data, error } = await rpc("sqop_audit_sharing_context");
  if (error) {
    if (["PGRST202", "42883"].includes(error.code || ""))
      return {
        installed: false,
        peers: [],
        groups: [],
        visible_branch_ids: null,
        branch_scoping_installed: false,
        manager_scopes: [],
      };
    throw new Error("تعذر التحقق من مجموعات مشاركة الأوديتس");
  }
  return { ...contextSchema.parse(data), installed: true };
}
export async function saveAuditShareGroup(id: string | null, name: string, members: string[]) {
  const memberIds = [...new Set(members)];
  if (
    !name.trim() ||
    name.trim().length > 100 ||
    memberIds.length < 2 ||
    !memberIds.every((value) => z.string().uuid().safeParse(value).success)
  )
    throw new Error("اكتب اسم المجموعة واختر عضوين على الأقل");
  const { error } = await rpc("sqop_set_audit_share_group", {
    p_group_id: id,
    p_name: name.trim(),
    p_member_ids: memberIds,
  });
  if (error) throw new Error(error.message);
}
export async function deleteAuditShareGroup(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error("المجموعة غير صالحة");
  const { error } = await rpc("sqop_delete_audit_share_group", { p_group_id: id });
  if (error) throw new Error(error.message);
}
/** Only UUIDs returned by the authenticated sharing context are accepted. */
export function auditOwnerFilter(
  userId: string,
  peers: readonly string[],
  submitted = false,
  branchIds: readonly string[] | null = null,
) {
  const ids = [...new Set([userId, ...peers])];
  if (branchIds && !branchIds.every((value) => z.string().uuid().safeParse(value).success))
    throw new Error("فروع الصلاحية غير صالحة");
  if (!ids.every((value) => z.string().uuid().safeParse(value).success))
    throw new Error("تعذر التحقق من أعضاء المشاركة");
  return [
    ...(submitted
      ? branchIds === null
        ? ["status.eq.submitted"]
        : branchIds.length
          ? [`and(status.eq.submitted,branch_id.in.(${branchIds.join(",")}))`]
          : []
      : []),
    ...ids.flatMap((id) => [`auditor_id.eq.${id}`, `created_by.eq.${id}`]),
  ].join(",");
}

export async function saveManagerBranchScope(userId: string, branchIds: string[] | null) {
  if (
    !z.string().uuid().safeParse(userId).success ||
    (branchIds && !branchIds.every((value) => z.string().uuid().safeParse(value).success))
  )
    throw new Error("بيانات الفروع غير صالحة");
  const { error } = await rpc("sqop_set_manager_branch_scope", {
    p_user_id: userId,
    p_branch_ids: branchIds === null ? null : [...new Set(branchIds)],
  });
  if (error) throw new Error(error.message);
}

import { supabase } from "@/integrations/supabase/client";
export async function deleteUserAccount(targetId: string, currentId: string | undefined) {
  if (!currentId) throw new Error("يجب تسجيل الدخول أولًا");
  if (targetId === currentId) throw new Error("لا يمكنك حذف حسابك الحالي");
  const { error } = await supabase.rpc("delete_user_completely", { target_user_id: targetId });
  // Never delete only profile/role rows after a failed Auth-account deletion.
  // The guarded database RPC is responsible for the complete transaction.
  if (error) throw error;
}

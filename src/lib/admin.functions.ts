import { createServerFn } from "@tanstack/react-start";

export const updateUserRoleServerFn = createServerFn({ method: "POST" })
    .validator((data: { userId: string; newRole: "admin" | "auditor" }) => data)
    .handler(async ({ data }) => {
        const { userId, newRole } = data;

        // استدعاء supabaseAdmin داخل السيرفر لتخطي قيود الـ RLS
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. مسح الدور القديم
        const { error: deleteError } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId);

        if (deleteError) {
            throw new Error(`تعذر حذف الرتبة السابقة: ${deleteError.message}`);
        }

        // 2. إسناد الدور الجديد
        const { error: insertError } = await supabaseAdmin
            .from("user_roles")
            .insert({
                user_id: userId,
                role: newRole,
            });

        if (insertError) {
            throw new Error(`تعذر إسناد الرتبة الجديدة: ${insertError.message}`);
        }

        return { success: true };
    });
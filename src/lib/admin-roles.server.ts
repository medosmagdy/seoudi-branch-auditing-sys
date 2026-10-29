import { z } from "zod";
import { requireServerActor, type ServerDatabase } from "./server-access.server";
export const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  newRole: z.enum(["admin", "manager", "auditor"]),
});
export async function changeUserRole(
  client: ServerDatabase,
  token: string | undefined,
  input: unknown,
) {
  const { userId, newRole } = roleChangeSchema.parse(input);
  const actor = await requireServerActor(client, token);
  if (actor.role !== "admin") throw new Error("تغيير الصلاحيات متاح لمدير النظام فقط");
  if (actor.id === userId && newRole !== "admin")
    throw new Error("لا يمكنك تخفيض صلاحية حسابك الحالي بنفسك");
  const { error } = await client
    .from("user_roles")
    .upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" })
    .select("user_id")
    .single();
  if (error) throw new Error("تعذر تحديث الصلاحية");
  return { success: true };
}

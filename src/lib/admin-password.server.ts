import { z } from "zod";
import { newPasswordSchema } from "./auth-flow";
import { requireServerActor, type ServerDatabase } from "./server-access.server";

export const adminPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: newPasswordSchema.refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "كلمة المرور تتجاوز الحد الأقصى المسموح",
  ),
});

export async function setUserPassword(
  client: ServerDatabase,
  token: string | undefined,
  input: unknown,
) {
  const actor = await requireServerActor(client, token);
  if (actor.role !== "admin") throw new Error("تعيين كلمة المرور متاح لمدير النظام فقط");
  const { userId, password } = adminPasswordSchema.parse(input);
  const { error } = await client.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error("تعذر تعيين كلمة المرور. تأكد من الحساب ومن شروط كلمة المرور.");
  return { success: true as const };
}

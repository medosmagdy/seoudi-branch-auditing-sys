import { z } from "zod";
import type { AppRole } from "./permissions";
export const emailSchema = z.string().trim().email("أدخل بريدًا إلكترونيًا صحيحًا").max(255);
export const newPasswordSchema = z
  .string()
  .min(8, "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف")
  .max(72);
// Existing accounts authenticate against the server's password, even if it was
// created under an older password-length policy. New passwords retain min 8.
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "أدخل كلمة المرور").max(72),
});
export const registrationSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  fullName: z.string().trim().min(2, "أدخل اسمك بالكامل").max(100),
});
export function authDestination(
  profile: { role: AppRole } | null,
  recovery: boolean,
  resetMode: "request" | "update" | null,
) {
  if (!profile || recovery || resetMode === "update") return null;
  return profile.role === "auditor" ? ("/audits" as const) : ("/dashboard" as const);
}

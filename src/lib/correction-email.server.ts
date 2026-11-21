import { z } from "zod";
import type { ServerActor, ServerDatabase } from "./server-access.server";
import {
  branchMailAddresses,
  missingRelation,
  reportAuditScope,
  sectionOverride,
  visibleApprovedAudit,
} from "./report-feature-access.server";

export const correctionSettingsSchema = z.object({
  roles: z.array(z.enum(["admin", "manager", "auditor"])).max(3),
  user_ids: z.array(z.string().uuid()).max(500),
});

export async function correctionPermission(db: ServerDatabase, actor: ServerActor) {
  const { data, error } = await db
    .from("audit_correction_email_settings")
    .select("roles, user_ids")
    .eq("id", true)
    .maybeSingle();
  if (error && !missingRelation(error.code)) throw new Error("تعذر التحقق من صلاحية إيميل التعديل");
  const settings = data ? correctionSettingsSchema.parse(data) : null;
  return {
    installed: !!settings,
    allowed:
      !!settings && (settings.roles.includes(actor.role) || settings.user_ids.includes(actor.id)),
    roles: actor.role === "admin" ? (settings?.roles ?? null) : null,
    user_ids: actor.role === "admin" ? (settings?.user_ids ?? null) : null,
  };
}
export async function saveCorrectionPermission(
  db: ServerDatabase,
  actor: ServerActor,
  raw: unknown,
) {
  if (actor.role !== "admin") throw new Error("تعديل الصلاحيات متاح لمدير النظام فقط");
  const settings = correctionSettingsSchema.parse(raw);
  const users = [...new Set(settings.user_ids)];
  for (let i = 0; i < users.length; i += 100) {
    const batch = users.slice(i, i + 100);
    const { data, error } = await db
      .from("profiles")
      .select("id")
      .eq("active", true)
      .in("id", batch);
    if (error || data?.length !== batch.length) throw new Error("اختار مستخدمين نشطين فقط");
  }
  const { error } = await db
    .from("audit_correction_email_settings")
    .update({
      roles: [...new Set(settings.roles)],
      user_ids: users,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id")
    .single();
  if (error) throw new Error("تعذر حفظ صلاحية إيميل التعديل");
  return { saved: true };
}
export async function correctionRecipients(
  db: ServerDatabase,
  actor: ServerActor,
  auditId: string,
) {
  const [permission, section] = await Promise.all([
    correctionPermission(db, actor),
    sectionOverride(db, actor, "audits"),
  ]);
  if (!permission.allowed || section === false) throw new Error("صلاحية إيميل التعديل غير متاحة");
  const [scope, response] = await Promise.all([
    reportAuditScope(db, actor),
    db
      .from("audits")
      .select("status, branch_id, created_by, auditor_id, audit_types(code, name_ar, name_en)")
      .eq("id", auditId)
      .maybeSingle(),
  ]);
  const audit = response.data;
  if (response.error || !audit || !visibleApprovedAudit(scope, audit))
    throw new Error("تجهيز إيميل التعديل متاح للأوديت المعتمد المسموح لك به");
  const type = audit.audit_types;
  if (
    /صيان|maintenance|\b(?:MAINT|MNT)\b/i.test([type?.code, type?.name_ar, type?.name_en].join(" "))
  )
    throw new Error("مستلمو إيميل الصيانة منفصلون عن قوائم الفروع");
  return branchMailAddresses(db, audit.branch_id);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/integrations/supabase/app-schema";
import type { AppRole } from "./permissions";
export type ServerDatabase = SupabaseClient<AppDatabase>;
export type ServerActor = { id: string; role: AppRole };

// Only a server-verified access token establishes identity. Never accept a user
// ID or editable user_metadata as authorization for service-role operations.
export async function requireServerActor(
  client: ServerDatabase,
  token: string | undefined,
): Promise<ServerActor> {
  if (!token) throw new Error("يجب تسجيل الدخول أولًا");
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    if (error.message.toLowerCase().includes("invalid api key"))
      throw new Error(
        "إعدادات اتصال السيرفر بقاعدة البيانات غير صحيحة؛ راجع مفتاح Supabase ومشروعه",
      );
    if (!error.status || error.status >= 500 || error.name === "AuthRetryableFetchError")
      throw new Error("تعذر الاتصال بخدمة تسجيل الدخول؛ أعد المحاولة");
  }
  if (error || !data.user) throw new Error("الجلسة غير صالحة؛ سجّل الدخول مرة أخرى");
  const id = data.user.id;
  const [profile, role] = await Promise.all([
    client.from("profiles").select("active").eq("id", id).maybeSingle(),
    client.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
  ]);
  if (profile.error || role.error) throw new Error("تعذر التحقق من صلاحيات الحساب");
  if (profile.data?.active !== true) throw new Error("الحساب غير مفعل");
  return {
    id,
    role: role.data?.role === "admin" || role.data?.role === "manager" ? role.data.role : "auditor",
  };
}
export async function requireAuditWrite(client: ServerDatabase, actor: ServerActor, id: string) {
  const { data: audit, error } = await client
    .from("audits")
    .select("id, audit_type_id, auditor_id, created_by, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("تعذر تحميل بيانات الفحص");
  if (!audit) throw new Error("غير مصرح بتعديل هذا الفحص");
  if (actor.role !== "admin" && audit.auditor_id !== actor.id && audit.created_by !== actor.id) {
    const { data: groups, error: groupError } = await client
      .from("audit_share_members" as never)
      .select("group_id")
      .eq("user_id", actor.id);
    if (groupError && !["42P01", "PGRST205"].includes(groupError.code))
      throw new Error("تعذر التحقق من مشاركة الفحص");
    const ids = (groups ?? []) as unknown as { group_id: string }[];
    if (!ids.length) throw new Error("غير مصرح بتعديل هذا الفحص");
    const owners = [audit.created_by, audit.auditor_id].filter((id): id is string => !!id);
    const { data: members, error: memberError } = await client
      .from("audit_share_members" as never)
      .select("user_id")
      .in(
        "group_id",
        ids.map((g) => g.group_id),
      )
      .in("user_id", owners);
    if (memberError) throw new Error("تعذر التحقق من مشاركة الفحص");
    const shared = (members ?? []) as unknown as { user_id: string }[];
    if (!shared.length) throw new Error("غير مصرح بتعديل هذا الفحص");
    const { data: active, error: activeError } = await client
      .from("profiles")
      .select("id")
      .in(
        "id",
        shared.map((m) => m.user_id),
      )
      .eq("active", true);
    if (activeError || !active?.length) throw new Error("غير مصرح بتعديل هذا الفحص");
  }
  return audit;
}
export async function requireAuditQuestion(
  client: ServerDatabase,
  actor: ServerActor,
  auditId: string,
  questionId: string,
) {
  const audit = await requireAuditWrite(client, actor, auditId);
  const { data: question, error } = await client
    .from("questions")
    .select("id, audit_type_id")
    .eq("id", questionId)
    .maybeSingle();
  if (error || !question || question.audit_type_id !== audit.audit_type_id)
    throw new Error("البند لا يتبع برنامج هذا الفحص");
}

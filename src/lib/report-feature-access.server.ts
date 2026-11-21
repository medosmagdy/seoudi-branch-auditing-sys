import { canReadAudit } from "./permissions";
import { readAllPages } from "./query-pages";
import { z } from "zod";
import { type ServerActor, type ServerDatabase } from "./server-access.server";

const missingRelation = (code: string | undefined) => code === "42P01" || code === "PGRST205";
export { missingRelation };
export async function sectionOverride(db: ServerDatabase, actor: ServerActor, section: string) {
  if (actor.role === "admin") return true;
  const { data, error } = await db
    .from("user_section_access")
    .select("visible")
    .eq("user_id", actor.id)
    .eq("section_key", section)
    .maybeSingle();
  if (error && !missingRelation(error.code)) throw new Error("تعذر التحقق من صلاحيات السكشن");
  return data?.visible ?? null;
}

export async function reportAuditScope(db: ServerDatabase, actor: ServerActor) {
  if (actor.role === "admin")
    return { role: actor.role, userId: actor.id, sharedUserIds: [], managerBranchIds: null };
  const [member, manager] = await Promise.all([
    db.from("audit_share_members").select("group_id").eq("user_id", actor.id),
    actor.role === "manager"
      ? db
          .from("manager_audit_branch_scopes")
          .select("branch_ids")
          .eq("user_id", actor.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (
    (member.error && !missingRelation(member.error.code)) ||
    (manager.error && !missingRelation(manager.error.code))
  )
    throw new Error("تعذر التحقق من صلاحية الأوديتات والفروع");
  const groupIds = [...new Set((member.data ?? []).map((entry) => entry.group_id))];
  const ids = new Set<string>();
  for (let i = 0; i < groupIds.length; i += 50) {
    const rows = await readAllPages((from, to) =>
      db
        .from("audit_share_members")
        .select("user_id, group_id")
        .in("group_id", groupIds.slice(i, i + 50))
        .order("group_id")
        .order("user_id")
        .range(from, to),
    );
    for (const row of rows) if (row.user_id !== actor.id) ids.add(row.user_id);
  }
  const sharedUserIds: string[] = [];
  const peers = [...ids];
  for (let i = 0; i < peers.length; i += 100) {
    const { data, error } = await db
      .from("profiles")
      .select("id")
      .eq("active", true)
      .in("id", peers.slice(i, i + 100));
    if (error) throw new Error("تعذر التحقق من مشاركة الأوديتات");
    for (const profile of data ?? []) sharedUserIds.push(z.string().uuid().parse(profile.id));
  }
  return {
    role: actor.role,
    userId: actor.id,
    sharedUserIds,
    managerBranchIds: manager.data?.branch_ids ?? null,
  };
}

export type ReportAuditScope = Awaited<ReturnType<typeof reportAuditScope>>;
export const visibleApprovedAudit = (
  scope: ReportAuditScope,
  audit: {
    status: string;
    branch_id: string;
    created_by: string | null;
    auditor_id: string | null;
  },
) =>
  audit.status === "submitted" &&
  canReadAudit({
    ...scope,
    status: audit.status,
    branchId: audit.branch_id,
    createdBy: audit.created_by,
    auditorId: audit.auditor_id,
  });

export async function branchMailAddresses(db: ServerDatabase, branchId: string) {
  const { data, error } = await db
    .from("branch_email_recipients")
    .select("to_addresses, cc_addresses")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error && !missingRelation(error.code)) throw new Error("تعذر تحميل مستلمي الفرع");
  return {
    installed: !error,
    configured: !!data,
    to_addresses: data?.to_addresses ?? [],
    cc_addresses: data?.cc_addresses ?? [],
  };
}

export type AppRole = "admin" | "manager" | "auditor";

export function canEditAudit({
  role,
  userId,
  createdBy,
  auditorId,
  status,
}: {
  role: AppRole;
  userId: string;
  createdBy?: string | null;
  auditorId?: string | null;
  status?: string | null;
}) {
  if (role === "admin") return true;
  return createdBy === userId || auditorId === userId;
}

export function canViewAllAudits(role: AppRole) {
  return role === "admin" || role === "manager";
}

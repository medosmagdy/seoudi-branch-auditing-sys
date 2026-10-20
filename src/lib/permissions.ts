export type AppRole = "admin" | "manager" | "auditor";

export function canEditAudit({
  role,
  userId,
  createdBy,
  status,
}: {
  role: AppRole;
  userId: string;
  createdBy?: string | null;
  status?: string | null;
}) {
  if (role === "admin") return true;
  if (status === "submitted" || status === "approved" || status === "reviewed") return false;
  return createdBy === userId;
}

export function canViewAllAudits(role: AppRole) {
  return role === "admin" || role === "manager";
}

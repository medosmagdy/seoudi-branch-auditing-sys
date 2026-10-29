export type AppRole = "admin" | "manager" | "auditor";

export function canEditAudit({
  role,
  userId,
  createdBy,
  auditorId,
  status,
  sharedUserIds = [],
}: {
  role: AppRole;
  userId: string;
  createdBy?: string | null;
  auditorId?: string | null;
  status?: string | null;
  sharedUserIds?: readonly string[];
}) {
  if (role === "admin") return true;
  return (
    createdBy === userId ||
    auditorId === userId ||
    sharedUserIds.some((id) => id === createdBy || id === auditorId)
  );
}

export function canViewAllAudits(role: AppRole) {
  return role === "admin" || role === "manager";
}

/** Drafts are visible only within the role’s ownership rules. */
export function canViewDraftAudits(role: AppRole) {
  return ["admin", "manager", "auditor"].includes(role);
}
export function canReadAudit({
  role,
  userId,
  createdBy,
  auditorId,
  status,
  sharedUserIds = [],
  branchId,
  managerBranchIds = null,
}: {
  role: AppRole;
  userId: string;
  createdBy?: string | null;
  auditorId?: string | null;
  status?: string | null;
  sharedUserIds?: readonly string[];
  branchId?: string | null;
  managerBranchIds?: readonly string[] | null;
}) {
  if (role === "admin") return true;
  if (
    createdBy === userId ||
    auditorId === userId ||
    sharedUserIds.some((id) => id === createdBy || id === auditorId)
  )
    return true;
  return (
    role === "manager" &&
    status === "submitted" &&
    (managerBranchIds === null || (!!branchId && managerBranchIds.includes(branchId)))
  );
}

import { auditReportFileBase } from "./audit-report-name";

export type AuditPhotoIdentity = {
  audit_date?: string | null;
  branches?: { name_ar: string; name_en: string | null } | null;
  audit_types?: { code: string; name_ar: string; name_en: string } | null;
};

export const auditPhotoIdentityColumns =
  "audit_date, branches(name_ar, name_en), audit_types(code, name_ar, name_en)";

export function auditPhotoFileBase(audit: AuditPhotoIdentity, auditId: string) {
  const label = auditReportFileBase({
    branchName: audit.branches?.name_ar ?? "",
    branchNameEn: audit.branches?.name_en ?? null,
    auditTypeName: audit.audit_types?.name_ar ?? "",
    auditTypeNameEn: audit.audit_types?.name_en ?? "",
    auditTypeCode: audit.audit_types?.code ?? null,
    auditDate: audit.audit_date ?? "",
  });
  const normalized = label.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-");
  const slug = Array.from(normalized)
    .slice(0, 100)
    .join("")
    .replace(/^-+|-+$/g, "");
  return `${slug || "Audit"}-${auditId.slice(0, 8)}`;
}

export function auditPhotoObjectName(audit: AuditPhotoIdentity, auditId: string, nonce: string) {
  return `${auditPhotoFileBase(audit, auditId)}--${nonce}.jpg`;
}

const legacyName = /^\d+-[a-f0-9-]+\.jpg$/;
const namedPhoto = /^[\p{L}\p{M}\p{N}-]{1,109}--[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.jpg$/u;

export function isUploadPhotoName(name: string, scope: "audit" | "expiry") {
  return legacyName.test(name) || (scope === "audit" && namedPhoto.test(name));
}

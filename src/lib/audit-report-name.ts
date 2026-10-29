interface AuditReportIdentity {
  branchName: string;
  branchNameEn?: string | null;
  auditTypeName: string;
  auditTypeNameEn: string;
  auditTypeCode?: string | null;
  auditDate: string;
}

function safeName(value: string) {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

export function auditReportFileBase(model: AuditReportIdentity) {
  const originalBranch = safeName(model.branchNameEn?.trim() || model.branchName || "Branch");
  const normalizedBranch = originalBranch.replace(/[\s_-]/g, "").toLowerCase();
  const branch = /^(citystars|سيتيستارز|سيتىستارز)$/.test(normalizedBranch)
    ? "CityStars"
    : /^(sheraton|شيراتون|شيرتون)$/.test(normalizedBranch)
      ? "Sheraton"
      : originalBranch || "Branch";
  const code = model.auditTypeCode?.trim().toUpperCase();
  const names = `${model.auditTypeNameEn} ${model.auditTypeName}`;
  const program =
    code && /^(FS|GHP|FSMS)$/.test(code)
      ? code
      : /\bFSMS\b|food safety management|إدارة سلامة الغذاء|أنظمة/i.test(names)
        ? "FSMS"
        : /\bGHP\b|good hygien|النظافة|الممارسات الصحية/i.test(names)
          ? "GHP"
          : /\bFS\b|food safety|سلامة الغذاء/i.test(names)
            ? "FS"
            : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(model.auditDate);
  let period = "Undated";
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(`${model.auditDate}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === model.auditDate) {
      period =
        program === "FSMS" ? `Q${Math.ceil(Number(month) / 3)}-${year}` : `${day}-${month}-${year}`;
    }
  }
  const auditType = program || safeName(model.auditTypeNameEn || model.auditTypeName);
  return `${branch}${auditType ? ` ${auditType}` : ""} Audit Report ${period}`;
}

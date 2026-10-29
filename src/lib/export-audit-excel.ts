import XLSX from "xlsx-js-style";
import { loadReportModel } from "./report-data";
import { buildAuditWorkbook } from "./audit-workbook";

export async function exportAuditToExcel(auditId: string) {
  const model = await loadReportModel(auditId, { includePhotos: false });
  const { workbook, filename } = buildAuditWorkbook(model);
  XLSX.writeFile(workbook, filename);
}

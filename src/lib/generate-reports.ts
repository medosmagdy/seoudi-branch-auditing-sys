import { supabase } from "@/integrations/supabase/client";
import { buildReportDocx } from "@/lib/export-docx";
import { nodeToPdfBlob } from "@/lib/export-pdf";
import { reportFileBase, type ReportModel } from "@/lib/report-data";

export interface GeneratedReport {
  base: string;
  pdf: Blob;
  docx: Blob;
  pdfUrl: string;
  docxUrl: string;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Renders both files, archives them in storage and records them against the audit. */
export async function generateReports(model: ReportModel, node: HTMLElement): Promise<GeneratedReport> {
  const base = reportFileBase(model);
  const [pdf, docx] = await Promise.all([nodeToPdfBlob(node), buildReportDocx(model)]);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // Storage keys must stay ASCII, while the downloaded filenames keep their original names.
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "report";
  const pdfPath = `${model.auditId}/${safeBase}_v${model.version}_${stamp}.pdf`;
  const docxPath = `${model.auditId}/${safeBase}_v${model.version}_${stamp}.docx`;

  const [pdfUpload, docxUpload] = await Promise.all([
    supabase.storage.from("audit-reports").upload(pdfPath, pdf, { contentType: "application/pdf" }),
    supabase.storage.from("audit-reports").upload(docxPath, docx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ]);
  if (pdfUpload.error || docxUpload.error) {
    console.error("report upload failed", pdfUpload.error, docxUpload.error);
  } else {
    await supabase.from("reports").insert({ audit_id: model.auditId, pdf_path: pdfPath, docx_path: docxPath });
  }


  return {
    base,
    pdf,
    docx,
    pdfUrl: pdfPath,
    docxUrl: docxPath,
  };
}

export async function zipReports(report: GeneratedReport): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(`${report.base}.pdf`, report.pdf);
  zip.file(`${report.base}.docx`, report.docx);
  return zip.generateAsync({ type: "blob" });
}

export async function logAuditEdit(auditId: string, action: string, detail: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_edit_logs").insert({
    audit_id: auditId,
    user_id: data.user.id,
    action: action.slice(0, 80),
    detail: detail.slice(0, 500),
  });
}

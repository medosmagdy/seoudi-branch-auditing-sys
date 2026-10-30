import type { ReportModel } from "./report-data";
import { auditReportFileBase } from "./audit-report-name";

const months = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
export type EmailAudit = Pick<
  ReportModel,
  | "status"
  | "branchName"
  | "branchNameEn"
  | "auditTypeName"
  | "auditTypeNameEn"
  | "auditTypeCode"
  | "auditDate"
  | "result"
> & { sections?: ReportModel["sections"] };
export function emailPercentage(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error("درجة التقرير غير صالحة لتجهيز البريد");
  return `${Number(value.toFixed(2))}%`;
}
export function auditEmailTemplate(model: EmailAudit) {
  if (model.status !== "submitted") throw new Error("تجهيز البريد متاح للأوديت المعتمد فقط");
  if (model.result.overallMax <= 0)
    throw new Error("التقرير لا يحتوي على درجة نهائية قابلة للتقييم");
  if (
    model.sections?.some(
      (section) =>
        !section.excluded &&
        section.groups.some((group) =>
          group.questions.some((question) => !question.isNa && question.unresolvedScore),
        ),
    )
  )
    throw new Error("التقرير به درجات غير محسومة؛ راجعها قبل تجهيز البريد");
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(model.auditDate);
  const parsed = new Date(`${model.auditDate}T00:00:00Z`);
  if (
    !date ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== model.auditDate
  )
    throw new Error("تاريخ الأوديت غير صالح");
  const code = model.auditTypeCode?.toUpperCase();
  const names = `${model.auditTypeName} ${model.auditTypeNameEn}`;
  const inferred = /\bFSMS\b|food safety management|إدارة سلامة الغذاء/i.test(names)
    ? "FSMS"
    : /\bGHP\b|good hygien|الممارسات الصحية|النظافة/i.test(names)
      ? "GHP"
      : /\bFS\b|food safety|سلامة الغذاء/i.test(names)
        ? "FS"
        : "";
  const program = code && ["FS", "GHP", "FSMS"].includes(code) ? code : inferred;
  const type =
    program === "FSMS"
      ? "نظام إدارة سلامة الغذاء"
      : program === "GHP"
        ? "الممارسات الصحية"
        : program === "FS"
          ? "سلامة الغذاء"
          : model.auditTypeName;
  const period = `${months[Number(date[2]) - 1]} ${date[1]}`;
  const delivery = model.result.delivery;
  const hasDelivery = !!delivery && !delivery.excluded && delivery.max > 0;
  const paragraphs = [
    `السادة/ إدارة فرع "${model.branchName}"`,
    ...(hasDelivery ? ["السادة/ إدارة التوصيل"] : []),
    "تحية طيبة وبعد،،",
    `مرسل تقرير مراجعة ${type} عن شهر ${period} وتقييم المراجعة النهائية للفرع: ${emailPercentage(model.result.finalPercentage)}`,
    ...(hasDelivery
      ? [`وتقييم المراجعة النهائية لقسم التوصيل: ${emailPercentage(delivery!.percentage)}`]
      : []),
    "وتفضلوا بقبول وافر الاحترام والتقدير،،",
  ];
  return { subject: auditReportFileBase(model), body: paragraphs.join("\n\n"), hasDelivery };
}
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function auditEmailHtml(body: string) {
  const paragraphs = body.split(/\n\s*\n/).map((p) =>
    escapeHtml(p)
      .replace(/\n/g, "<br>")
      .replace(
        /\d+(?:\.\d+)?%/g,
        (score) =>
          `<span style="background-color:#ffff00;color:#000000;padding:0 3px;">${score}</span>`,
      ),
  );
  return `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;font-family:Arial,Tahoma,sans-serif;font-size:16px;line-height:1.9;color:#111111;">${paragraphs.map((p) => `<p style="margin:0 0 18px;"><strong>${p}</strong></p>`).join("")}</div>`;
}
export function emailRecipients(raw: string) {
  const addresses = raw
    .split(/[,;\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  if (addresses.length > 100) throw new Error("عدد المستلمين كبير؛ الحد الأقصى 100 لكل حقل");
  for (const address of addresses)
    if (
      address.length > 254 ||
      address.split("@")[0]!.length > 64 ||
      !/^[A-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(
        address,
      )
    )
      throw new Error("اكتب عناوين بريد صحيحة فقط، وافصل بينها بفاصلة أو فاصلة منقوطة");
  return [...new Map(addresses.map((v) => [v.toLowerCase(), v])).values()];
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function encoded(value: string) {
  return base64(new TextEncoder().encode(value));
}
function lines(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}
function subjectHeader(value: string) {
  // RFC 2047 chunks stay below 75 characters and never split a UTF-8 character.
  const chunks: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (new TextEncoder().encode(chunk + character).length > 42) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((v) => `=?UTF-8?B?${encoded(v)}?=`).join("\r\n ");
}
export async function auditEmailDraft(input: {
  subject: string;
  body: string;
  to: string;
  cc: string;
  pdf: Blob;
  pdfName: string;
}) {
  if (/[\r\n]/.test(input.subject) || !input.subject.trim() || input.subject.length > 500)
    throw new Error("عنوان الرسالة غير صالح");
  if (!input.body.trim() || input.body.length > 20_000)
    throw new Error("نص الرسالة غير صالح أو أطول من الحد المسموح");
  if (!input.pdf.size || input.pdf.type !== "application/pdf") throw new Error("ملف PDF غير جاهز");
  if (input.pdf.size > 20 * 1024 * 1024)
    throw new Error("حجم التقرير أكبر من 20 ميجابايت؛ صدّره وأرفقه يدويًا بالبريد");
  const to = emailRecipients(input.to),
    toSet = new Set(to.map((v) => v.toLowerCase()));
  const cc = emailRecipients(input.cc).filter((v) => !toSet.has(v.toLowerCase()));
  const name = input.pdfName.replace(/[\r\n\\/]/g, " ").trim();
  const mix = `sqop_mix_${crypto.randomUUID()}`,
    alt = `sqop_alt_${crypto.randomUUID()}`;
  const sections = [
    "MIME-Version: 1.0",
    "X-Unsent: 1",
    `Subject: ${subjectHeader(input.subject.trim())}`,
    ...(to.length ? [`To: ${to.join(",\r\n ")}`] : []),
    ...(cc.length ? [`Cc: ${cc.join(",\r\n ")}`] : []),
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    "",
    `--${mix}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines(encoded(input.body)),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lines(
      encoded(
        `<!doctype html><html><head><meta charset="UTF-8"></head><body>${auditEmailHtml(input.body)}</body></html>`,
      ),
    ),
    `--${alt}--`,
    `--${mix}`,
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
    "Content-Transfer-Encoding: base64",
    "",
    lines(base64(new Uint8Array(await input.pdf.arrayBuffer()))),
    `--${mix}--`,
    "",
  ];
  return new Blob([sections.join("\r\n")], { type: "message/rfc822" });
}
export function downloadEmailDraft(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

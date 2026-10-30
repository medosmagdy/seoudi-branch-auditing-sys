import { utils, type WorkBook } from "xlsx";
import {
  findingStatuses,
  severities,
  metrics,
  type LogFinding,
  type Finding,
  type MaintenanceReport,
  reportFileName,
} from "./maintenance";
export function maintenanceWorkbook(
  rows: (Finding & { branch_name?: string; inspection_date?: string })[],
  title: string,
): WorkBook {
  const book = utils.book_new(),
    m = metrics(rows);
  const data: unknown[][] = [
    [title],
    [
      "الإجمالي",
      m.total,
      "تم",
      m.resolved,
      "لم تغلق",
      m.open,
      "نسبة الإغلاق",
      m.rate === null ? "—" : m.rate / 100,
    ],
    [],
    [
      "الفرع",
      "تاريخ الفحص",
      "كود الملاحظة",
      "القسم",
      "نقاط الصيانة",
      "تاريخ العطل",
      "الخطورة",
      "الإجراء التصحيحي",
      "الأدلة",
      "الحالة",
      "تعليقات",
      "مسؤول التنفيذ",
      "موعد الإغلاق",
      "الصور",
    ],
  ];
  let photo = 0;
  for (const f of rows)
    data.push([
      f.branch_name ?? "",
      f.inspection_date ?? "",
      f.id,
      f.section,
      f.description,
      f.initial_history,
      severities[f.severity],
      f.corrective_action,
      f.evidence,
      findingStatuses[f.status],
      f.comments,
      f.assigned_to,
      f.due_date ?? "",
      f.photos.map(() => `صورة ${++photo}`).join("، "),
    ]);
  const sheet = utils.aoa_to_sheet(data);
  sheet["!cols"] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 38 },
    { wch: 20 },
    { wch: 65 },
    { wch: 16 },
    { wch: 14 },
    { wch: 45 },
    { wch: 40 },
    { wch: 15 },
    { wch: 40 },
    { wch: 22 },
    { wch: 16 },
    { wch: 24 },
  ];
  sheet["!autofilter"] = { ref: `A4:N${Math.max(4, data.length)}` };
  sheet["!rows"] = data.map((_, i) => ({ hpt: i < 4 ? 24 : 48 }));
  if (m.rate !== null) sheet["H2"].z = "0.00%";
  book.Workbook = { Views: [{ RTL: true }] } as NonNullable<WorkBook["Workbook"]>;
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
  for (let r = 0; r < data.length; r++)
    for (let c = 0; c < 14; c++) {
      const address = utils.encode_cell({ r, c });
      const cell = sheet[address] ?? { t: "s", v: "" };
      cell.s = {
        font: {
          name: "Arial",
          sz: r === 0 ? 16 : 11,
          color: { rgb: r === 0 || r === 3 ? "FFFFFF" : "173D32" },
          bold: r < 4,
        },
        fill: {
          fgColor: { rgb: r === 0 || r === 3 ? "174D3A" : r % 2 === 0 ? "F1F7F4" : "FFFFFF" },
        },
        alignment: { horizontal: "right", vertical: "center", wrapText: true },
      };
      sheet[address] = cell;
    }
  utils.book_append_sheet(book, sheet, "Maintenance");
  const photos = utils.aoa_to_sheet([
    ["صور الملاحظات بالترتيب حسب عمود الصور في التقرير"],
    ["لاستعراض الأدلة النصية راجع عمود الأدلة في التقرير"],
  ]);
  photos["!cols"] = [{ wch: 100 }];
  utils.book_append_sheet(book, photos, "Related pictures");
  return book;
}
export async function downloadMaintenanceExcel(
  rows: (Finding & { branch_name?: string; inspection_date?: string })[],
  name: string,
  urls: Record<string, string>,
) {
  const { attachSlaughterImages, photoForExcel } = await import("./slaughter-images");
  const count = rows.reduce((n, r) => n + r.photos.length, 0);
  if (count > 300)
    throw new Error(
      "النتائج تحتوي أكثر من 300 صورة؛ حدد فرعًا أو فلتر النتائج لتصديرها على دفعات.",
    );
  const images = [];
  for (const f of rows)
    for (const path of f.photos) {
      if (!urls[path]) throw new Error("تعذر تحميل صورة؛ لن يتم تصدير تقرير ناقص");
      const r = await fetch(urls[path]!);
      if (!r.ok) throw new Error("تعذر تحميل الصور");
      images.push(await photoForExcel(await r.blob()));
    }
  const book = maintenanceWorkbook(rows, name);
  let offset = 3;
  for (const [i, image] of images.entries()) {
    utils.sheet_add_aoa(book.Sheets["Related pictures"]!, [[`صورة ${i + 1}`]], {
      origin: { r: offset - 1, c: 0 },
    });
    const width = Math.min(image.width, 720),
      height = Math.round((width * image.height) / image.width);
    offset += Math.ceil(height / 20) + 2;
  }
  const { default: XLSX } = await import("xlsx-js-style");
  const styledBytes = new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx", compression: true }),
  );
  const bytes = images.length
    ? await attachSlaughterImages(book, images, styledBytes)
    : styledBytes;
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function maintenanceReportRows(report: MaintenanceReport, branch: string) {
  return report.findings.map((f) => ({
    ...f,
    branch_name: branch,
    inspection_date: report.inspection_date,
  }));
}

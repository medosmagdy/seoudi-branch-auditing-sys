import JSZip from "jszip";
import { read, utils, SSF, type WorkBook, type WorkSheet, type CellObject } from "xlsx";
import { xml2js, type Element } from "xml-js";
import { blankFinding, findingSchema, type Finding } from "./maintenance";
export interface ImportPhoto {
  key: string;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg" | "image/webp";
}
export interface ImportedFinding {
  row: number;
  finding: Finding;
  images: ImportPhoto[];
}
export interface MaintenanceImport {
  sheet: string;
  branch: string;
  reviewer: string;
  inspectionDate: string;
  rows: ImportedFinding[];
  warnings: string[];
}
const key = (v: string) =>
  v
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_\-/:()،.؟]/g, "");
const headers: Record<string, string[]> = {
  section: ["القسم", "section", "sectionالقسم"],
  description: [
    "نقاط الصيانة",
    "نقاط الصيانه",
    "maintenance points",
    "maintenancepointsنقاطالصيانة",
    "الملاحظة",
    "الوصف",
  ],
  initial_history: ["تاريخ العطل", "initial history", "initialhistoryتاريخالعطل"],
  severity: ["الخطورة", "الأهمية", "severity", "severityتقييم", "تقييم"],
  status: ["الحالة", "status", "statusالحالةتم/لم يتم/جديد", "حالة الملاحظة"],
  corrective_action: [
    "الإجراء التصحيحي",
    "الاجراء التصحيحى المتخذ",
    "corrective action",
    "correctiveactionالإجراءالتصحيحىالمتخذ",
  ],
  evidence: [
    "الأدلة",
    "objective evidence",
    "objective evidance",
    "objectiveevidanceأدلةتوضيحيةميلطلبشراءصورةتصحيحلنقطةالصيانة",
  ],
  comments: ["تعليقات", "ملاحظات", "comments", "commentsملاحظات"],
  assigned_to: ["مسؤول التنفيذ", "المكلف", "assigned to"],
  due_date: ["موعد الإغلاق", "موعد الإغلاق المستهدف", "due date"],
  photos: ["صورة توضيحية", "imageصورةتوضيحية", "الصور", "image", "photo"],
};
const headerMap = new Map(
  Object.entries(headers).flatMap(([field, labels]) => labels.map((label) => [key(label), field])),
);
function children(node: Element | undefined, name: string) {
  return (
    node?.elements?.filter((e) => e.type === "element" && e.name?.split(":").pop() === name) ?? []
  );
}
function child(node: Element | undefined, name: string) {
  return children(node, name)[0];
}
function text(node: Element | undefined): string {
  return (node?.elements ?? [])
    .map((e) => (e.type === "text" ? String(e.text ?? "") : text(e)))
    .join("");
}
function attr(node: Element | undefined, name: string) {
  return String(node?.attributes?.[name] ?? "");
}
function parse(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("ملف XML غير مدعوم");
  return xml2js(xml, { compact: false, ignoreComment: true, ignoreDeclaration: true }) as Element;
}
function root(doc: Element) {
  return doc.elements?.find((e) => e.type === "element");
}
function resolve(base: string, target: string) {
  if (!target || /^([a-z]+:|\/\/)/i.test(target)) throw new Error("ارتباط صورة خارجي غير مدعوم");
  const parts = (
      target.startsWith("/") ? target.slice(1) : base.slice(0, base.lastIndexOf("/") + 1) + target
    ).split("/"),
    out: string[] = [];
  for (const p of parts) {
    if (p === "..") {
      if (!out.length) throw new Error("مسار غير صالح");
      out.pop();
    } else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}
function relPath(part: string) {
  const i = part.lastIndexOf("/");
  return part.slice(0, i + 1) + "_rels/" + part.slice(i + 1) + ".rels";
}
function validateZip(bytes: Uint8Array) {
  if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("حجم الملف أكبر من 30 ميجابايت");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (d.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  if (e < 0) throw new Error("اختر ملف .xlsx صالح");
  const count = d.getUint16(e + 10, true);
  if (count > 2500 || count === 65535) throw new Error("الملف كبير أو غير مدعوم");
  let p = d.getUint32(e + 16, true),
    total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || d.getUint32(p, true) !== 0x02014b50)
      throw new Error("ملف Excel تالف");
    const size = d.getUint32(p + 24, true);
    total += size;
    if (size > 25 * 1024 * 1024 || total > 150 * 1024 * 1024 || d.getUint16(p + 8, true) & 1)
      throw new Error("ملف مشفر أو أكبر من الحجم المدعوم");
    p += 46 + d.getUint16(p + 28, true) + d.getUint16(p + 30, true) + d.getUint16(p + 32, true);
  }
}
function cellText(cell: CellObject | undefined) {
  if (!cell || cell.t === "e") return "";
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return String(cell.w ?? cell.v ?? "").trim();
}
function cellDate(cell: CellObject | undefined) {
  if (!cell || cell.v == null || cell.v === "") return "";
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (typeof cell.v === "number") {
    const d = SSF.parse_date_code(cell.v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const t = String(cell.v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  throw new Error("تاريخ غير معروف؛ استخدم تاريخ Excel أو YYYY-MM-DD");
}
function enumValue(value: string, field: "status" | "severity", row: number) {
  const k = key(value),
    values =
      field === "status"
        ? {
            تم: "resolved",
            resolved: "resolved",
            completed: "resolved",
            closed: "resolved",
            لميتم: "open",
            open: "open",
            جديد: "new",
            new: "new",
            قيدالتنفيذ: "in_progress",
            قيدالمعالجه: "in_progress",
            inprogress: "in_progress",
            ongoing: "in_progress",
          }
        : {
            high: "high",
            عاليه: "high",
            عالي: "high",
            medium: "medium",
            متوسطه: "medium",
            متوسط: "medium",
            low: "low",
            منخفضه: "low",
            منخفض: "low",
          };
  const result = (values as Record<string, string>)[k];
  if (!result)
    throw new Error(
      `الصف ${row}: ${field === "status" ? "الحالة" : "الخطورة"} غير معروفة (${value || "فارغة"})`,
    );
  return result;
}
export class MaintenanceWorkbook {
  private xmlCache = new Map<string, Element>();
  private imageCache = new Map<string, Promise<ImportPhoto>>();
  readonly sheets: string[];
  constructor(
    private book: WorkBook,
    private zip: JSZip,
  ) {
    this.sheets = book.SheetNames;
  }
  private async xml(path: string) {
    if (!this.xmlCache.has(path)) {
      const file = this.zip.file(path);
      if (!file) throw new Error(`ملف Excel ناقص: ${path}`);
      this.xmlCache.set(path, parse(await file.async("string")));
    }
    return this.xmlCache.get(path)!;
  }
  private async rels(part: string) {
    const file = this.zip.file(relPath(part));
    if (!file) return new Map<string, string>();
    const node = root(await this.xml(relPath(part)));
    return new Map(
      children(node, "Relationship")
        .filter((n) => attr(n, "TargetMode") !== "External")
        .map((n) => [attr(n, "Id"), resolve(part, attr(n, "Target"))]),
    );
  }
  private image(path: string) {
    if (!this.imageCache.has(path))
      this.imageCache.set(
        path,
        (async () => {
          const f = this.zip.file(path);
          if (!f) throw new Error("صورة مفقودة داخل الإكسيل");
          const bytes = await f.async("uint8array");
          if (bytes.length > 8 * 1024 * 1024) throw new Error("صورة داخل الملف أكبر من 8 ميجابايت");
          const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
            jpeg = bytes[0] === 255 && bytes[1] === 216,
            webp =
              String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
          if (!png && !jpeg && !webp) throw new Error("صيغة صورة غير مدعومة داخل الملف");
          return { key: path, bytes, mime: png ? "image/png" : jpeg ? "image/jpeg" : "image/webp" };
        })(),
      );
    return this.imageCache.get(path)!;
  }
  private async sheetPart(name: string) {
    const workbook = root(await this.xml("xl/workbook.xml")),
      node = children(child(workbook, "sheets"), "sheet").find((n) => attr(n, "name") === name),
      rels = await this.rels("xl/workbook.xml");
    const part = rels.get(attr(node, "r:id"));
    if (!part) throw new Error("تعذر تحديد صفحة الإكسيل");
    return part;
  }
  private async richImages() {
    if (!this.zip.file("xl/metadata.xml")) return [] as (string | undefined)[];
    const meta = root(await this.xml("xl/metadata.xml")),
      types = children(child(meta, "metadataTypes"), "metadataType"),
      type = types.findIndex((t) => attr(t, "name") === "XLRICHVALUE") + 1;
    if (!type) return [];
    const future = children(meta, "futureMetadata").find((n) => attr(n, "name") === "XLRICHVALUE");
    if (!future) return [];
    const blocks = children(future, "bk"),
      futureIndexes = blocks.map((b) => {
        const ext = child(child(b, "extLst"), "ext");
        return Number(attr(child(ext, "rvb"), "i"));
      });
    const data = root(await this.xml("xl/richData/rdrichvalue.xml")),
      structures = children(root(await this.xml("xl/richData/rdrichvaluestructure.xml")), "s"),
      relations = children(root(await this.xml("xl/richData/richValueRel.xml")), "rel"),
      targets = await this.rels("xl/richData/richValueRel.xml"),
      values = children(data, "rv");
    return children(child(meta, "valueMetadata"), "bk").map((b) => {
      const rc = children(b, "rc").find((n) => Number(attr(n, "t")) === type);
      if (!rc) return undefined;
      const rv = values[futureIndexes[Number(attr(rc, "v"))]!];
      if (!rv) return undefined;
      const structure = structures[Number(attr(rv, "s"))],
        position = children(structure, "k").findIndex(
          (n) => attr(n, "n") === "_rvRel:LocalImageIdentifier",
        );
      if (position < 0) return undefined;
      const relation = relations[Number(text(children(rv, "v")[position]))];
      return targets.get(attr(relation, "r:id"));
    });
  }
  private async imagesForSheet(name: string) {
    const part = await this.sheetPart(name),
      doc = root(await this.xml(part)),
      byCell = new Map<string, string[]>(),
      rich = await this.richImages();
    for (const row of children(child(doc, "sheetData"), "row"))
      for (const cell of children(row, "c")) {
        const vm = Number(attr(cell, "vm"));
        if (vm) {
          const path = rich[vm - 1];
          if (!path) throw new Error(`تعذر ربط صورة الخلية ${attr(cell, "r")}`);
          byCell.set(attr(cell, "r"), [path]);
        }
      }
    const relations = await this.rels(part);
    for (const drawing of children(doc, "drawing")) {
      const drawingPart = relations.get(attr(drawing, "r:id"));
      if (!drawingPart) throw new Error("رابط صور ناقص");
      const drawingDoc = root(await this.xml(drawingPart)),
        drawingRels = await this.rels(drawingPart);
      for (const anchor of drawingDoc?.elements ?? []) {
        if (!["oneCellAnchor", "twoCellAnchor"].includes(anchor.name?.split(":").pop() ?? ""))
          continue;
        const from = child(anchor, "from"),
          pic = child(anchor, "pic");
        if (!pic) continue;
        const blip = child(child(pic, "blipFill"), "blip"),
          path = drawingRels.get(attr(blip, "r:embed"));
        if (!path) throw new Error("صورة خارجية أو مفقودة غير مدعومة");
        const address = utils.encode_cell({
          r: Number(text(child(from, "row"))),
          c: Number(text(child(from, "col"))),
        });
        byCell.set(address, [...(byCell.get(address) ?? []), path]);
      }
    }
    return byCell;
  }
  async preview(name: string): Promise<MaintenanceImport> {
    const sheet = this.book.Sheets[name];
    if (!sheet) throw new Error("اختر صفحة من الملف");
    const range = utils.decode_range(sheet["!ref"] ?? "A1");
    if (range.e.r > 5000 || range.e.c > 100)
      throw new Error("عدد صفوف أو أعمدة الصفحة أكبر من المدعوم");
    let header = -1,
      cols: Record<string, number> = {};
    for (let r = 0; r <= Math.min(range.e.r, 100); r++) {
      const found: Record<string, number> = {};
      for (let c = 0; c <= range.e.c; c++) {
        const k = headerMap.get(key(cellText(sheet[utils.encode_cell({ r, c })])));
        if (k) {
          if (k in found) throw new Error(`عمود ${k} مكرر في صف العناوين`);
          found[k] = c;
        }
      }
      if (["section", "description", "severity", "status"].every((k) => k in found)) {
        header = r;
        cols = found;
        break;
      }
    }
    if (header < 0)
      throw new Error(
        "لم أجد عناوين القسم ونقاط الصيانة والخطورة والحالة. اختَر صفحة التقرير الصحيحة.",
      );
    const images = await this.imagesForSheet(name),
      related = new Map<number, string[]>();
    if (this.book.SheetNames.includes("Related pictures")) {
      const relatedSheet = this.book.Sheets["Related pictures"]!;
      for (const [address, paths] of await this.imagesForSheet("Related pictures")) {
        const pos = utils.decode_cell(address),
          label = cellText(relatedSheet[utils.encode_cell({ r: pos.r - 1, c: 0 })]),
          m = /^صورة\s*(\d+)$/.exec(label);
        if (m) related.set(Number(m[1]), paths);
      }
    }
    const rows: ImportedFinding[] = [],
      used = new Set<string>();
    const warnings: string[] = [];
    for (let r = header + 1; r <= range.e.r; r++) {
      const at = (k: string) =>
        cols[k] === undefined ? undefined : sheet[utils.encode_cell({ r, c: cols[k]! })];
      const description = cellText(at("description")),
        section = cellText(at("section"));
      if (key(section) === key("تقييم الخطورة")) break;
      if (!description && !section) continue;
      if (!description) {
        if (["تقييمالخطوره", "تقييمالخطورة"].map(key).includes(key(section))) break;
        throw new Error(`الصف ${r + 1}: وصف الملاحظة فارغ`);
      }
      if (!section) throw new Error(`الصف ${r + 1}: القسم فارغ`);
      const finding = {
        ...blankFinding(),
        section,
        description,
        initial_history: cellText(at("initial_history")),
        severity: enumValue(cellText(at("severity")), "severity", r + 1) as Finding["severity"],
        status: enumValue(cellText(at("status")), "status", r + 1) as Finding["status"],
        corrective_action: cellText(at("corrective_action")),
        evidence: cellText(at("evidence")),
        comments: cellText(at("comments")),
        assigned_to: cellText(at("assigned_to")),
        due_date: cellDate(at("due_date")) || null,
      };
      findingSchema.parse(finding);
      const paths: string[] = [];
      for (const [address, values] of images) {
        const p = utils.decode_cell(address);
        if (
          p.r === r &&
          (cols["photos"] === undefined || p.c === cols["photos"] || p.c === cols["evidence"])
        ) {
          paths.push(...values);
          used.add(address);
        }
      }
      const photoLabel = cellText(at("photos"));
      for (const match of photoLabel.matchAll(/صورة\s*(\d+)/g)) {
        const refs = related.get(Number(match[1]));
        if (!refs) throw new Error(`الصف ${r + 1}: صورة ${match[1]} غير موجودة في الملف`);
        paths.push(...refs);
      }
      const unique = [...new Set(paths)];
      if (unique.length > 8) throw new Error(`الصف ${r + 1}: أكثر من 8 صور للملاحظة`);
      rows.push({
        row: r + 1,
        finding,
        images: await Promise.all(unique.map((p) => this.image(p))),
      });
      if (rows.length > 1000) throw new Error("الحد الأقصى 1000 ملاحظة لكل تقرير");
    }
    if (!rows.length) throw new Error("لا توجد ملاحظات للاستيراد");
    const unmatched = [...images.keys()].filter(
      (a) => !used.has(a) && utils.decode_cell(a).r > header,
    );
    if (unmatched.length)
      warnings.push(
        `${unmatched.length} خلية صور لم ترتبط بالملاحظات؛ راجع مواضع الصور قبل المتابعة.`,
      );
    let branch = "",
      reviewer = "",
      inspectionDate = "";
    for (let r = 0; r < header; r++)
      for (let c = 0; c < Math.min(range.e.c, 10); c++) {
        const label = key(cellText(sheet[utils.encode_cell({ r, c })]));
        const next = sheet[utils.encode_cell({ r, c: c + 1 })];
        if (label === "الفرع") branch = cellText(next);
        if (label === "المراجع") reviewer = cellText(next);
        if (["تاريخالتحديث", "تاريخالفحص"].includes(label)) inspectionDate = cellDate(next);
      }
    return { sheet: name, branch, reviewer, inspectionDate, rows, warnings };
  }
}
export async function openMaintenanceWorkbook(bytes: Uint8Array) {
  validateZip(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const book = read(bytes, { type: "array", cellDates: false, cellText: true, cellNF: true });
  return new MaintenanceWorkbook(book, zip);
}

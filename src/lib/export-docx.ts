import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { scoreLabel, type ReportModel } from "@/lib/report-data";

const BRAND = "214D32";
const CONTENT_WIDTH = 9360;

const en = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({
    text,
    font: "Arial",
    size: options.size ?? 22,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.color === undefined ? {} : { color: options.color }),
  });

const ar = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({
    text,
    font: "Arial",
    size: options.size ?? 22,
    rightToLeft: true,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.color === undefined ? {} : { color: options.color }),
  });

const arParagraph = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80 },
    children: [ar(text, options)],
  });

const enParagraph = (text: string, options: { bold?: boolean; size?: number; center?: boolean } = {}) =>
  new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 80 },
    children: [en(text, options)],
  });

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const margins = { top: 80, bottom: 80, left: 120, right: 120 };

function cell(children: Paragraph[], width: number, fill?: string) {
  return new TableCell({
    borders,
    margins,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
    children,
  });
}

async function fetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildReportDocx(model: ReportModel): Promise<Blob> {
  const { result } = model;
  const children: (Paragraph | Table)[] = [];

  // ---- Cover page -------------------------------------------------------
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      shading: { fill: BRAND, type: ShadingType.CLEAR },
      children: [en("SEOUDI  ·  SBAS", { bold: true, size: 36, color: "FFFFFF" })],
    }),
    enParagraph(model.auditTypeNameEn || "Audit Report", { bold: true, size: 40, center: true }),
    arParagraph(model.auditTypeName, { bold: true, size: 28 }),
    enParagraph(" "),
  );

  const info: [string, string, boolean][] = [
    ["Branch", model.branchName, true],
    ["Branch Manager", model.branchManager || "—", false],
    ["Auditor", model.auditorName || "—", false],
    ["Audit Date", model.auditDate, false],
    ["Report Version", String(model.version), false],
  ];
  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [3000, 6360],
      rows: info.map(([label, value, isArabic]) =>
        new TableRow({
          children: [
            cell([enParagraph(label, { bold: true })], 3000, "E5ECE5"),
            cell([isArabic ? arParagraph(value) : enParagraph(value)], 6360),
          ],
        }),
      ),
    }),
    enParagraph(" "),
  );

  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [3120, 3120, 3120],
      rows: [
        new TableRow({
          children: [
            cell([enParagraph("Overall Percentage", { bold: true, center: true })], 3120, "E5ECE5"),
            cell([enParagraph("General Deduction", { bold: true, center: true })], 3120, "E5ECE5"),
            cell([enParagraph("Final Result", { bold: true, center: true })], 3120, BRAND ? "A0D164" : undefined),
          ],
        }),
        new TableRow({
          children: [
            cell([enParagraph(`${result.overallPercentage}%`, { bold: true, size: 40, center: true })], 3120),
            cell([enParagraph(`${result.generalDeductionPercentage}%`, { bold: true, size: 40, center: true })], 3120),
            new TableCell({
              borders,
              margins,
              width: { size: 3120, type: WidthType.DXA },
              shading: { fill: BRAND, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [en(`${result.finalPercentage}%`, { bold: true, size: 48, color: "FFFFFF" })],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ---- Summary table ----------------------------------------------------
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [en("Summary", { bold: true, size: 32 })] }));

  const summaryRows: TableRow[] = [
    new TableRow({
      children: [
        cell([enParagraph("Section", { bold: true })], 4200, "E5ECE5"),
        cell([enParagraph("Score", { bold: true })], 1720, "E5ECE5"),
        cell([enParagraph("Max", { bold: true })], 1720, "E5ECE5"),
        cell([enParagraph("Percentage", { bold: true })], 1720, "E5ECE5"),
      ],
    }),
  ];

  result.sections
    .filter((section) => !section.excluded && !section.isDelivery)
    .forEach((section) => {
      summaryRows.push(
        new TableRow({
          children: [
            cell([arParagraph(section.nameAr)], 4200),
            cell([enParagraph(String(section.finalScore))], 1720),
            cell([enParagraph(String(section.max))], 1720),
            cell([enParagraph(`${section.percentage}%`, { bold: true })], 1720),
          ],
        }),
      );
    });

  if (result.delivery) {
    summaryRows.push(
      new TableRow({
        children: [
          cell([arParagraph(result.delivery.nameAr), enParagraph("Delivery — scored separately")], 4200, "F3F7F3"),
          cell([enParagraph(String(result.delivery.finalScore))], 1720, "F3F7F3"),
          cell([enParagraph(String(result.delivery.max))], 1720, "F3F7F3"),
          cell([enParagraph(`${result.delivery.percentage}%`, { bold: true })], 1720, "F3F7F3"),
        ],
      }),
    );
  }

  summaryRows.push(
    new TableRow({
      children: [
        cell([enParagraph("Overall (excluding Delivery)", { bold: true })], 4200, "E5ECE5"),
        cell([enParagraph(String(result.overallRawScore), { bold: true })], 1720, "E5ECE5"),
        cell([enParagraph(String(result.overallMax), { bold: true })], 1720, "E5ECE5"),
        cell([enParagraph(`${result.finalPercentage}%`, { bold: true })], 1720, "E5ECE5"),
      ],
    }),
  );

  children.push(
    new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [4200, 1720, 1720, 1720], rows: summaryRows }),
  );

  if (model.generalDeductions.length > 0) {
    children.push(
      enParagraph(" "),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [en("General Deductions", { bold: true, size: 26 })] }),
    );
    model.generalDeductions.forEach((deduction) => {
      children.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          children: [ar(`${deduction.reasonText} — ${deduction.percentage}%`)],
        }),
      );
    });
  }

  // ---- Section detail pages --------------------------------------------
  for (const section of model.sections.filter((entry) => !entry.excluded)) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        heading: HeadingLevel.HEADING_1,
        children: [ar(section.nameAr, { bold: true, size: 32 })],
      }),
    );
    if (section.isDelivery) children.push(enParagraph("Delivery section — scored separately"));

    for (const group of section.groups) {
      if (group.labelAr) {
        children.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200, after: 80 },
            children: [ar(group.labelAr, { bold: true, size: 26, color: BRAND })],
          }),
        );
      }

      const rows: TableRow[] = [
        new TableRow({
          children: [
            cell([enParagraph("Question", { bold: true })], 6000, "E5ECE5"),
            cell([enParagraph("Score", { bold: true })], 1200, "E5ECE5"),
            cell([enParagraph("Comment", { bold: true })], 2160, "E5ECE5"),
          ],
        }),
      ];
      group.questions.forEach((question) => {
        rows.push(
          new TableRow({
            children: [
              cell([arParagraph(question.textAr), enParagraph(question.itemId, { size: 16 })], 6000),
              cell([enParagraph(`${scoreLabel(question)} / ${question.maxScore}`, { center: true })], 1200),
              cell([question.comment ? arParagraph(question.comment) : enParagraph("—")], 2160),
            ],
          }),
        );
      });
      children.push(
        new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [6000, 1200, 2160], rows }),
      );
    }

    if (section.deductions.length > 0) {
      children.push(enParagraph("Internal deductions:", { bold: true }));
      section.deductions.forEach((deduction) =>
        children.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            children: [ar(`${deduction.reasonText} — ${deduction.percentage}%`)],
          }),
        ),
      );
    }
  }

  // ---- Photos appendix --------------------------------------------------
  const withPhotos = model.sections
    .flatMap((section) => section.groups.flatMap((group) => group.questions))
    .filter((question) => question.photos.length > 0);

  if (withPhotos.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [en("Photo Appendix", { bold: true, size: 32 })] }),
    );
    for (const question of withPhotos) {
      children.push(arParagraph(question.textAr, { bold: true }));
      for (const photo of question.photos) {
        const data = await fetchImage(photo.url);
        if (!data) continue;
        children.push(
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new ImageRun({
                type: "jpg",
                data,
                transformation: { width: 320, height: 240 },
                altText: {
                  title: "Audit photo",
                  description: `Photo for item ${question.itemId}`,
                  name: `photo-${question.itemId}`,
                },
              }),
            ],
          }),
        );
      }
    }
  }

  const document = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}

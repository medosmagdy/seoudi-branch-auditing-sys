import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const MARGIN_MM = 10;

const CORS_FALLBACK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function collectBreakpoints(target: HTMLElement): number[] {
  const top = target.getBoundingClientRect().top;
  const blocks = Array.from(target.querySelectorAll<HTMLElement>("[data-report-block]"));
  const points = blocks.map((el) => el.getBoundingClientRect().bottom - top);
  return Array.from(new Set(points.map((p) => Math.round(p)))).sort((a, b) => a - b);
}

function addCanvas(pdf: jsPDF, canvas: HTMLCanvasElement, isFirst: boolean, breakpointsPx: number[], cssWidth: number) {
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidthMm - MARGIN_MM * 2;
  const contentHeightMm = pageHeightMm - MARGIN_MM * 2;

  const pxPerMm = canvas.width / contentWidthMm;
  const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);
  const ratio = cssWidth > 0 ? canvas.width / cssWidth : 1;
  const breaks = breakpointsPx.map((p) => Math.round(p * ratio));

  let offset = 0;
  let first = isFirst;

  while (offset < canvas.height) {
    const remaining = canvas.height - offset;
    let sliceHeight = Math.min(pageHeightPx, remaining);

    if (remaining > pageHeightPx) {
      const limit = offset + pageHeightPx;
      const candidates = breaks.filter((b) => b > offset + pageHeightPx * 0.25 && b <= limit);
      if (candidates.length > 0) {
        sliceHeight = candidates[candidates.length - 1]! - offset;
      }
    }

    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext("2d");
    if (!context) throw new Error("تعذر إنشاء شريحة الصفحة للـ PDF");

    // ضمان خلفية بيضاء صريحة للشريحة
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (!first) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.95),
      "JPEG",
      MARGIN_MM,
      MARGIN_MM,
      contentWidthMm,
      sliceHeight / pxPerMm,
    );
    first = false;
    offset += sliceHeight;
  }
}

export async function nodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pages = Array.from(node.querySelectorAll<HTMLElement>("[data-report-page]"));
  const targets = pages.length > 0 ? pages : [node];

  let first = true;
  for (const target of targets) {
    const breaks = collectBreakpoints(target);
    const rect = target.getBoundingClientRect();
    const cssWidth = Math.ceil(rect.width || target.scrollWidth || 800);
    const cssHeight = Math.ceil(target.scrollHeight || rect.height || 1000);

    const canvas = await toCanvas(target, {
      pixelRatio: 2,
      width: cssWidth,
      height: cssHeight,
      backgroundColor: "#ffffff",
      imagePlaceholder: CORS_FALLBACK_IMAGE,
      cacheBust: true,
      skipFonts: true, // يمنع SecurityError بتاع Google Fonts
      fontEmbedCSS: "", // يمنع محاولة جلب الخطوط الخارجية inline
      filter: (domNode: HTMLElement) => !domNode.classList?.contains("print:hidden"),
    });

    addCanvas(pdf, canvas, first, breaks, cssWidth);
    first = false;
  }

  return pdf.output("blob");
}

export async function downloadElementAsPdf(node: HTMLElement, fileName: string) {
  const blob = await nodeToPdfBlob(node);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blankFinding, type MaintenanceReport } from "./maintenance";
import { MaintenancePdfDocument } from "../components/maintenance/MaintenancePdfDocument";
const mock = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("./export-pdf", () => ({ downloadElementAsPdf: mock.download }));
import { downloadMaintenancePdf } from "./maintenance-pdf";
const base: MaintenanceReport = {
  id: "00000000-0000-4000-8000-000000000001",
  branch_id: "00000000-0000-4000-8000-000000000002",
  inspection_date: "2026-09-01",
  reviewer: "مراجع",
  status: "submitted",
  version: 1,
  created_at: "2026-09-01",
  source_report_id: null,
  findings: [
    {
      ...blankFinding(),
      section: "سمك",
      description: "ملاحظة",
      status: "resolved",
      photos: [
        "maintenance/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg",
      ],
    },
    { ...blankFinding(), section: "جزارة", description: "مشكلة", status: "open" },
  ],
};
it("renders a report cover with correct selected counts, people and photo references", () => {
  const path = base.findings[0]!.photos[0]!,
    html = renderToStaticMarkup(
      createElement(MaintenancePdfDocument, {
        report: base,
        branch: "شيراتون",
        branchManager: "مدير الفرع",
        areaManager: "مدير المنطقة",
        urls: { [path]: "https://example.test/signed" },
        scope: "كل الأقسام · كل الحالات",
      }),
    );
  expect(html).toContain("مدير الفرع");
  expect(html).toContain("مدير المنطقة");
  expect(html).toContain("نسبة الإغلاق");
  expect(html).toContain("50.0%");
  expect(html).toContain("https://example.test/signed");
  expect((html.match(/data-report-page/g) || []).length).toBe(2);
});
describe("PDF photo preparation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("fetches the exact signed URL once, embeds image data and removes the temporary document", async () => {
    const url = "https://example.test/image.jpg?X-Amz-Signature=unchanged";
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetcher);
    class Reader {
      result: string | ArrayBuffer | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.result = "data:image/jpeg;base64,aW1hZ2U=";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", Reader);
    const cloneImage = {
        src: "",
        removeAttribute: vi.fn(),
        decode: vi.fn().mockResolvedValue(undefined),
      },
      clone = { style: {}, querySelectorAll: () => [cloneImage, cloneImage], remove: vi.fn() },
      original = { getAttribute: () => url },
      node = { cloneNode: () => clone, querySelectorAll: () => [original, original] };
    vi.stubGlobal("document", { body: { appendChild: vi.fn() } });
    await downloadMaintenancePdf(node as unknown as HTMLElement, "report");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(url);
    expect(cloneImage.src).toBe("data:image/jpeg;base64,aW1hZ2U=");
    expect(mock.download).toHaveBeenCalledWith(clone, "report");
    expect(clone.remove).toHaveBeenCalled();
  });
  it("fails instead of silently omitting photos when the signed URL is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const cloneImage = { removeAttribute: vi.fn() },
      clone = { style: {}, querySelectorAll: () => [cloneImage] },
      node = {
        cloneNode: () => clone,
        querySelectorAll: () => [{ getAttribute: () => "https://example.test/expired" }],
      };
    await expect(downloadMaintenancePdf(node as unknown as HTMLElement, "report")).rejects.toThrow(
      "تعذر تحميل",
    );
    expect(mock.download).not.toHaveBeenCalled();
  });
});

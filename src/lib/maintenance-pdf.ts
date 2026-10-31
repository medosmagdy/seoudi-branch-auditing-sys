import { downloadElementAsPdf } from "./export-pdf";
async function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر تجهيز صور التقرير"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("تعذر تجهيز صور التقرير"));
    reader.readAsDataURL(blob);
  });
}
// Copy signed images into the PDF document as data URLs. Adding cache-busting query parameters to signed R2 URLs breaks their signatures.
export async function downloadMaintenancePdf(node: HTMLElement, filename: string) {
  const clone = node.cloneNode(true) as HTMLElement;
  const originals = Array.from(node.querySelectorAll<HTMLImageElement>("img")),
    images = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  const cache = new Map<string, Promise<string>>();
  let next = 0;
  async function worker() {
    while (next < images.length) {
      const i = next++;
      const src = originals[i]?.getAttribute("src");
      if (!src) throw new Error("صورة غير متاحة؛ أعد تحميل الصور قبل تصدير PDF");
      if (!cache.has(src))
        cache.set(
          src,
          (async () => {
            const response = await fetch(src);
            if (!response.ok) throw new Error("تعذر تحميل صورة التقرير؛ أعد المحاولة");
            const blob = await response.blob();
            if (!blob.type.startsWith("image/")) throw new Error("ملف صورة غير صالح");
            return blobDataUrl(blob);
          })(),
        );
      images[i]!.removeAttribute("crossorigin");
      images[i]!.src = await cache.get(src)!;
    }
  }
  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.min(4, images.length) }, worker),
  );
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
  );
  if (failure) throw failure.reason;
  clone.style.position = "fixed";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.width = "900px";
  clone.style.zIndex = "-1";
  document.body.appendChild(clone);
  try {
    await Promise.all(images.map((image) => image.decode()));
    await downloadElementAsPdf(clone, filename);
  } finally {
    clone.remove();
  }
}

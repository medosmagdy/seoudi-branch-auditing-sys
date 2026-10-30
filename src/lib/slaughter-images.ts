import JSZip from "jszip";
import { write, type WorkBook } from "xlsx";
export interface SlaughterExcelImage {
  bytes: Uint8Array;
  extension: "png" | "jpeg";
  width: number;
  height: number;
}
export async function attachSlaughterImages(
  workbook: WorkBook,
  images: SlaughterExcelImage[],
  workbookBytes?: Uint8Array,
): Promise<Uint8Array> {
  const bytes =
    workbookBytes ?? write(workbook, { type: "array", bookType: "xlsx", compression: true });
  if (!images.length) return new Uint8Array(bytes);
  const index = workbook.SheetNames.indexOf("Related pictures");
  if (index < 0) throw new Error("Missing Related pictures worksheet");
  const zip = await JSZip.loadAsync(bytes),
    sheetPath = `xl/worksheets/sheet${index + 1}.xml`;
  let sheet = await zip.file(sheetPath)!.async("string");
  if (!sheet.includes("xmlns:r="))
    sheet = sheet.replace(
      "<worksheet ",
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
    );
  sheet = sheet.replace("</worksheet>", '<drawing r:id="rIdSlaughterPictures"/></worksheet>');
  zip.file(sheetPath, sheet);
  const relationNS = "http://schemas.openxmlformats.org/package/2006/relationships";
  zip.file(
    `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relationNS}"><Relationship Id="rIdSlaughterPictures" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/slaughterPictures.xml"/></Relationships>`,
  );
  let anchors = "",
    relations = "";
  let offset = 3;
  for (const [i, image] of images.entries()) {
    if (
      !Number.isFinite(image.width) ||
      !Number.isFinite(image.height) ||
      image.width <= 0 ||
      image.height <= 0
    )
      throw new Error("Invalid image dimensions");
    const width = Math.min(image.width, 720),
      height = Math.round((width * image.height) / image.width);
    zip.file(`xl/media/slaughter-${i + 1}.${image.extension}`, image.bytes);
    relations += `<Relationship Id="rIdPhoto${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/slaughter-${i + 1}.${image.extension}"/>`;
    anchors += `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${offset}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${width * 9525}" cy="${height * 9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="Photo ${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdPhoto${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width * 9525}" cy="${height * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    offset += Math.ceil(height / 20) + 2;
  }
  zip.file(
    "xl/drawings/slaughterPictures.xml",
    `<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`,
  );
  zip.file(
    "xl/drawings/_rels/slaughterPictures.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relationNS}">${relations}</Relationships>`,
  );
  let content = await zip.file("[Content_Types].xml")!.async("string");
  for (const extension of new Set(images.map((i) => i.extension)))
    if (!content.includes(`Extension="${extension}"`))
      content = content.replace(
        "</Types>",
        `<Default Extension="${extension}" ContentType="image/${extension}"/></Types>`,
      );
  content = content.replace(
    "</Types>",
    '<Override PartName="/xl/drawings/slaughterPictures.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
  );
  zip.file("[Content_Types].xml", content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
export async function photoForExcel(blob: Blob): Promise<SlaughterExcelImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز الصورة");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("تعذر تجهيز الصورة"))),
        "image/png",
      ),
    );
    return {
      bytes: new Uint8Array(await png.arrayBuffer()),
      extension: "png",
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

import { supabase } from "@/integrations/supabase/client";
import { photoUploadServerFn, registerPhotoServerFn, deletePhotoServerFn } from "./photo.functions";
import { createPhotoAuthorization, deleteWithSessionRecovery } from "./photo-auth";
// Access the lazy client only when a photo operation actually runs.
const photoAuthorization = createPhotoAuthorization({
  getSession: () => supabase.auth.getSession(),
  refreshSession: () => supabase.auth.refreshSession(),
});
const authorizationHeaders = photoAuthorization.headers;
export async function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) return resolve(file);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(file);
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export async function uploadQuestionPhoto(auditId: string, questionId: string, file: File) {
  const compressedBlob = await compressImage(file);
  const upload = { scope: "audit" as const, recordId: auditId, questionId };
  const headers = await authorizationHeaders();
  const { url, path } = await photoUploadServerFn({ data: upload, headers });
  const response = await fetch(url, { method: "PUT", body: compressedBlob });
  if (!response.ok) throw new Error(`فشل رفع الصورة: ${response.statusText}`);
  return registerPhotoServerFn({ data: { upload, path }, headers });
}
export async function uploadExpiryPhotos(expiryRecordId: string, files: File[]) {
  const uploaded = [];
  for (const file of files) {
    const compressedBlob = await compressImage(file);
    const upload = { scope: "expiry" as const, recordId: expiryRecordId };
    const headers = await authorizationHeaders();
    const { url, path } = await photoUploadServerFn({ data: upload, headers });
    const response = await fetch(url, {
      method: "PUT",
      body: compressedBlob,
      headers: { "Content-Type": "image/jpeg" },
    });
    if (!response.ok) throw new Error("فشل رفع صورة الإكسباير");
    uploaded.push(await registerPhotoServerFn({ data: { upload, path }, headers }));
  }
  return uploaded;
}
export async function uploadQuestionPhotos(auditId: string, questionId: string, files: File[]) {
  let uploaded = 0;
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadQuestionPhoto(auditId, questionId, file);
      uploaded++;
    } catch {
      failed.push(file.name);
    }
  }
  return { uploaded, failed };
}
export async function deletePhoto(photoId: string, _storagePath: string) {
  return deleteWithSessionRecovery(photoAuthorization, (headers) =>
    deletePhotoServerFn({ data: { photoId }, headers }),
  );
}
async function fetchAuditPhoto(photoId: string, headers: { Authorization: string }) {
  const response = await fetch(`/api/audit-photos/${encodeURIComponent(photoId)}`, {
    headers,
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("سجّل الدخول أولًا لعرض الصورة أو تنزيلها");
  if (!response.ok) throw new Error("تعذر تحميل الصورة");
  return response;
}

export async function loadAuditPhotoUrls(photoIds: string[]): Promise<Record<string, string>> {
  if (!photoIds.length) return {};
  const headers = await authorizationHeaders();
  const urls: Record<string, string> = {};
  const ids = [...new Set(photoIds)];
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.allSettled(
      ids.slice(i, i + 5).map(async (id) => {
        const photo = await fetchAuditPhoto(id, headers);
        const image = await photo.blob();
        urls[id] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(image);
        });
      }),
    );
  }
  return urls;
}

export async function downloadAuditPhoto(photoId: string) {
  const response = await fetchAuditPhoto(photoId, await authorizationHeaders());
  const image = await response.blob();
  const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1] || "jpg";
  const url = URL.createObjectURL(image);
  const link = document.createElement("a");
  link.href = url;
  const named = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i);
  let filename = `audit-photo-${photoId.slice(0, 8)}.${extension}`;
  if (named) {
    try {
      filename = decodeURIComponent(named[1]!);
    } catch {
      // An older server or a malformed name should not prevent downloading.
    }
  }
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

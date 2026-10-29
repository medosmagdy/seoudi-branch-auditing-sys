import { supabase } from "@/integrations/supabase/client";
import { photoUploadServerFn, registerPhotoServerFn, deletePhotoServerFn } from "./photo.functions";
import { createPhotoAuthorization, deleteWithSessionRecovery } from "./photo-auth";
const R2_PUBLIC_URL = (import.meta.env["VITE_R2_PUBLIC_URL"] || "").replace(/\/$/, "");
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
  const uploaded = [];
  for (const file of files) uploaded.push(await uploadQuestionPhoto(auditId, questionId, file));
  return uploaded;
}
export async function deletePhoto(photoId: string, _storagePath: string) {
  return deleteWithSessionRecovery(photoAuthorization, (headers) =>
    deletePhotoServerFn({ data: { photoId }, headers }),
  );
}
export async function signedPhotoUrls(storagePaths: string[]): Promise<Record<string, string>> {
  if (!storagePaths.length) return {};

  const map: Record<string, string> = {};

  storagePaths.forEach((path) => {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      map[path] = path;
    } else if (R2_PUBLIC_URL) {
      map[path] = `${R2_PUBLIC_URL}/${path.split("/").map(encodeURIComponent).join("/")}`;
    } else {
      map[path] = "";
    }
  });

  return map;
}

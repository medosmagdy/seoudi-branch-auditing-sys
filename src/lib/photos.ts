import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "@/integrations/supabase/client";

const R2_ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID || "299d2d3bf7a2f726a67a789b7203b620";
const R2_ACCESS_KEY = import.meta.env.VITE_R2_ACCESS_KEY_ID || "a684f3904f57781ce11903874aa7cb03";
const R2_SECRET_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY || "db0d778b008ea1e5c73a7c3c896f5341ed48c3da7957dfcdf6aebf103df6fc67";
const R2_BUCKET = import.meta.env.VITE_R2_BUCKET_NAME || "audit-photos";
const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/$/, "");

// عميل S3 المخصص لـ R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

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
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export async function uploadQuestionPhoto(auditId: string, questionId: string, file: File) {
  const compressedBlob = await compressImage(file);
  const fileName = `${auditId}/${questionId}/${Date.now()}.jpg`;

  // نوقع فقط الـ Bucket والـ Key بدون إلزامية Headers لتجاوز الـ Preflight
  const putCommand = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: fileName,
  });

  const uploadUrl = await getSignedUrl(r2Client, putCommand, {
    expiresIn: 300,
  });

  // رفع نظيف ومتوافق مع CORS
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: compressedBlob,
    headers: {
      "Content-Type": "image/jpeg",
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`فشل رفع الصورة: ${uploadResponse.statusText}`);
  }

  const { data: photoRecord, error: dbError } = await supabase
    .from("photos")
    .insert({
      audit_id: auditId,
      question_id: questionId,
      storage_path: fileName,
    } as never)
    .select()
    .single();

  if (dbError) throw dbError;
  return photoRecord;
}

export async function deletePhoto(photoId: string, storagePath: string) {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
    });
    await r2Client.send(deleteCommand);
  } catch (err) {
    console.error("خطأ أثناء الحذف من Cloudflare R2:", err);
  }

  await supabase.from("photos").delete().eq("id", photoId);
}

export async function signedPhotoUrls(storagePaths: string[]): Promise<Record<string, string>> {
  if (!storagePaths.length) return {};

  const map: Record<string, string> = {};

  storagePaths.forEach((path) => {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      map[path] = path;
    } else if (R2_PUBLIC_URL) {
      map[path] = `${R2_PUBLIC_URL}/${path}`;
    } else {
      map[path] = path;
    }
  });

  return map;
}
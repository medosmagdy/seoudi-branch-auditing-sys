import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  requireServerActor,
  requireAuditQuestion,
  requireAuditWrite,
  type ServerDatabase,
} from "./server-access.server";
import { z } from "zod";
export const photoUploadSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("audit"),
    recordId: z.string().uuid(),
    questionId: z.string().uuid(),
  }),
  z.object({ scope: z.literal("expiry"), recordId: z.string().uuid() }),
]);
export type PhotoUpload = z.infer<typeof photoUploadSchema>;
function storage() {
  const account = process.env["R2_ACCOUNT_ID"],
    accessKeyId = process.env["R2_ACCESS_KEY_ID"],
    secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!account || !accessKeyId || !secretAccessKey)
    throw new Error("إعدادات تخزين الصور غير مكتملة على السيرفر؛ تواصل مع مسؤول النظام");
  return {
    bucket: process.env["R2_BUCKET_NAME"] || "audit-photos",
    client: new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}
async function authorizeUpload(db: ServerDatabase, token: string | undefined, input: PhotoUpload) {
  const actor = await requireServerActor(db, token);
  if (input.scope === "audit")
    await requireAuditQuestion(db, actor, input.recordId, input.questionId);
  else {
    const { data, error } = await db
      .from("expiry_records")
      .select("id, created_by")
      .eq("id", input.recordId)
      .maybeSingle();
    if (error || !data || (actor.role !== "admin" && data.created_by !== actor.id))
      throw new Error("غير مصرح بإضافة صور لهذا السجل");
  }
}
export async function createPhotoUpload(
  db: ServerDatabase,
  token: string | undefined,
  value: unknown,
) {
  const input = photoUploadSchema.parse(value);
  await authorizeUpload(db, token, input);
  const prefix =
    input.scope === "audit" ? `${input.recordId}/${input.questionId}` : `expiry/${input.recordId}`;
  const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const { client, bucket } = storage();
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: path }), {
    expiresIn: 300,
  });
  return { url, path };
}
export const photoRegistrationSchema = z.object({
  upload: photoUploadSchema,
  path: z.string().max(512),
});
export async function registerPhoto(db: ServerDatabase, token: string | undefined, value: unknown) {
  const { upload, path } = photoRegistrationSchema.parse(value);
  await authorizeUpload(db, token, upload);
  const prefix =
    upload.scope === "audit"
      ? `${upload.recordId}/${upload.questionId}/`
      : `expiry/${upload.recordId}/`;
  if (!path.startsWith(prefix) || !/^\d+-[a-f0-9-]+\.jpg$/.test(path.slice(prefix.length)))
    throw new Error("مسار الصورة غير صالح");
  const result =
    upload.scope === "audit"
      ? await db
          .from("photos")
          .insert({ audit_id: upload.recordId, question_id: upload.questionId, storage_path: path })
          .select()
          .single()
      : await db
          .from("expiry_record_images")
          .insert({ expiry_record_id: upload.recordId, storage_path: path })
          .select()
          .single();
  if (result.error) throw new Error("تم رفع الصورة لكن تعذر تسجيلها؛ أعد المحاولة");
  return result.data;
}
export async function removePhoto(db: ServerDatabase, token: string | undefined, photoId: string) {
  z.string().uuid().parse(photoId);
  const actor = await requireServerActor(db, token);
  const { data: photo, error } = await db
    .from("photos")
    .select("id, audit_id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (error || !photo) throw new Error("الصورة غير متاحة");
  await requireAuditWrite(db, actor, photo.audit_id);
  if (!/^https?:\/\//i.test(photo.storage_path)) {
    if (!photo.storage_path.startsWith(`${photo.audit_id}/`) || photo.storage_path.includes(".."))
      throw new Error("مسار الصورة غير صالح");
    const { client, bucket } = storage();
    // Keep the database record if object deletion fails, so a retry is possible.
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: photo.storage_path }));
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      const status = failure?.$metadata?.httpStatusCode;
      // A missing object is already deleted; allow removal of its stale metadata.
      if (failure?.name !== "NoSuchKey") {
        if (status === 401 || status === 403 || failure?.name === "AccessDenied")
          throw new Error("حساب تخزين الصور لا يسمح بالحذف؛ راجع صلاحية DeleteObject على السيرفر");
        throw new Error("تعذر الاتصال بتخزين الصور؛ أعد المحاولة");
      }
    }
  }
  const { error: removeError } = await db
    .from("photos")
    .delete()
    .eq("id", photoId)
    .select("id")
    .single();
  if (removeError) throw new Error("تعذر حذف سجل الصورة؛ أعد المحاولة");
  return { success: true as const };
}

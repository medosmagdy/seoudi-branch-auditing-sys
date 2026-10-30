import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireServerActor, type ServerDatabase } from "./server-access.server";
import { z } from "zod";
export const maintenancePhotoRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload"), report_id: z.string().uuid() }),
  z.object({
    action: z.literal("register"),
    report_id: z.string().uuid(),
    path: z.string().regex(/^maintenance\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/),
  }),
  z.object({
    action: z.literal("read"),
    paths: z.array(z.string().regex(/^maintenance\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/)).max(8000),
  }),
]);
export async function maintenancePhotoOperation(
  db: ServerDatabase,
  token: string | undefined,
  value: unknown,
) {
  const input = maintenancePhotoRequest.parse(value),
    actor = await requireServerActor(db, token);
  if (actor.role !== "admin") {
    const access = await db
      .from("user_section_access" as never)
      .select("visible")
      .eq("user_id", actor.id)
      .eq("section_key", "maintenance")
      .maybeSingle();
    if (access.error || (access.data as { visible: boolean } | null)?.visible !== true)
      throw new Error("غير مصرح بالدخول للصيانة");
  }
  if (input.action !== "read") {
    const report = await db
      .from("maintenance_reports" as never)
      .select("id")
      .eq("id", input.report_id)
      .maybeSingle();
    if (report.error || !report.data) throw new Error("التقرير غير متاح");
  }
  const account = process.env["R2_ACCOUNT_ID"],
    key = process.env["R2_ACCESS_KEY_ID"],
    secret = process.env["R2_SECRET_ACCESS_KEY"];
  if (!account || !key || !secret) throw new Error("إعدادات تخزين الصور غير مكتملة على السيرفر");
  const client = new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: key, secretAccessKey: secret },
    }),
    bucket = process.env["R2_BUCKET_NAME"] || "audit-photos";
  if (input.action === "upload") {
    const path = `maintenance/${input.report_id}/${crypto.randomUUID()}.jpg`;
    const row = await db
      .from("maintenance_photos" as never)
      .insert({ path, report_id: input.report_id, registered: false } as never);
    if (row.error) throw new Error("تعذر تجهيز سجل الصورة");
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: path, ContentType: "image/jpeg" }),
      { expiresIn: 300 },
    );
    return { url, path };
  }
  if (input.action === "register") {
    if (!input.path.startsWith(`maintenance/${input.report_id}/`)) throw new Error("مسار غير صالح");
    const pending = await db
      .from("maintenance_photos" as never)
      .select("path")
      .eq("path", input.path)
      .eq("report_id", input.report_id)
      .maybeSingle();
    if (pending.error || !pending.data) throw new Error("الصورة غير متاحة");
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.path }));
    if (
      !head.ContentLength ||
      head.ContentLength > 8 * 1024 * 1024 ||
      head.ContentType !== "image/jpeg"
    )
      throw new Error("صورة غير صالحة أو أكبر من الحجم المسموح");
    const result = await db
      .from("maintenance_photos" as never)
      .update({ registered: true } as never)
      .eq("path", input.path);
    if (result.error) throw new Error("تعذر تسجيل الصورة");
    return { path: input.path };
  }
  const paths = [...new Set(input.paths)],
    result: Record<string, string> = {};
  // Batch directory checks, with bounded signature concurrency and no arbitrary R2 keys.
  for (let start = 0; start < paths.length; start += 100) {
    const chunk = paths.slice(start, start + 100),
      found = await db
        .from("maintenance_photos" as never)
        .select("path")
        .in("path", chunk)
        .eq("registered", true);
    if (found.error || found.data?.length !== chunk.length)
      throw new Error("تعذر تحميل الصور المسجلة");
    for (let i = 0; i < chunk.length; i += 10)
      await Promise.all(
        chunk.slice(i, i + 10).map(async (path) => {
          result[path] = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucket, Key: path }),
            { expiresIn: 3600 },
          );
        }),
      );
  }
  return { urls: result };
}

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { canReadAudit } from "./permissions";
import { auditPhotoFileBase, auditPhotoIdentityColumns } from "./audit-photo-name";
import { requireAuditWrite, requireServerActor, type ServerDatabase } from "./server-access.server";

const photoIdSchema = z.string().uuid();
const supportedTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function getAuditImage(key: string) {
  const account = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!account || !accessKeyId || !secretAccessKey) throw new Error("R2 unavailable");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client.send(
    new GetObjectCommand({
      Bucket: process.env["R2_BUCKET_NAME"] || "audit-photos",
      Key: key,
    }),
  );
}

export async function serveAuditPhoto(
  db: ServerDatabase,
  request: Request,
  photoId: string,
  getImage = getAuditImage,
) {
  const fail = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return fail(405);
  if (!photoIdSchema.safeParse(photoId).success) return fail(404);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return fail(401);

  const actor = await requireServerActor(db, token).catch(() => null);
  if (!actor) return fail(401);
  if (actor.role !== "admin") {
    const section = await db
      .from("user_section_access" as never)
      .select("visible")
      .eq("user_id", actor.id)
      .eq("section_key", "audits")
      .maybeSingle();
    if (
      (section.error && !["PGRST205", "42P01"].includes(section.error.code)) ||
      (section.data as { visible?: boolean } | null)?.visible === false
    )
      return fail(404);
  }
  const photo = await db
    .from("photos")
    .select("audit_id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (photo.error || !photo.data) return fail(404);
  const audit = await db
    .from("audits")
    .select(`id, auditor_id, created_by, status, branch_id, ${auditPhotoIdentityColumns}`)
    .eq("id", photo.data.audit_id)
    .maybeSingle();
  if (audit.error || !audit.data) return fail(404);

  let managerBranchIds: readonly string[] | null = [];
  if (actor.role === "manager" && audit.data.status === "submitted") {
    const scope = await db
      .from("manager_audit_branch_scopes" as never)
      .select("branch_ids")
      .eq("user_id", actor.id)
      .maybeSingle();
    // Do not grant general manager access if the scope lookup fails.
    if (!scope.error) {
      const data = scope.data as { branch_ids?: unknown } | null;
      if (!data) managerBranchIds = null;
      else if (
        Array.isArray(data.branch_ids) &&
        data.branch_ids.every((v) => typeof v === "string")
      )
        managerBranchIds = data.branch_ids;
    }
  }
  const allowed = canReadAudit({
    role: actor.role,
    userId: actor.id,
    auditorId: audit.data.auditor_id,
    createdBy: audit.data.created_by,
    branchId: audit.data.branch_id,
    status: audit.data.status,
    managerBranchIds,
  });
  // The existing write check recognizes owners and active sharing peers; sharing
  // also allows reading. This adds no access to an unrelated audit.
  if (!allowed && !(await requireAuditWrite(db, actor, audit.data.id).catch(() => null)))
    return fail(404);

  const key = photo.data.storage_path;
  const extension = key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const contentType = supportedTypes[extension];
  if (!contentType || !key.startsWith(`${audit.data.id}/`) || key.includes("..")) return fail(404);
  try {
    const image = await getImage(key);
    if (!image.Body) return fail(404);
    const filename = `${auditPhotoFileBase(audit.data, audit.data.id)}--${photoId}.${extension}`;
    return new Response(image.Body.transformToWebStream() as ReadableStream<Uint8Array>, {
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    return fail(502);
  }
}

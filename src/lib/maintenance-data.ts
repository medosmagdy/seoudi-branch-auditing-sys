import { carryLatestUnfinished } from "./maintenance-carry";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import {
  reportSchema,
  findingSchema,
  type MaintenanceReport,
  type Branch,
  type ReportSummary,
  type LogFinding,
} from "./maintenance";
export async function maintenanceRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      n: string,
      a?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
  )(name, args);
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? ""))
      throw new Error(
        "سكشن الصيانة يحتاج تفعيل تعديل الداتابيز أولًا؛ البيانات ليست محفوظة محليًا.",
      );
    throw new Error(error.message);
  }
  return data;
}
export async function loadMaintenanceIndex() {
  const data = await maintenanceRpc("sqop_maintenance_index");
  return z
    .object({
      branches: z.array(
        z.object({
          id: z.string().uuid(),
          name_ar: z.string(),
          name_en: z.string().nullable().optional(),
        }),
      ),
      reports: z.array(
        z.object({
          id: z.string().uuid(),
          branch_id: z.string().uuid(),
          inspection_date: z.string(),
          reviewer: z.string(),
          status: z.enum(["draft", "submitted"]),
          version: z.number(),
          created_at: z.string(),
          total: z.number(),
          resolved: z.number(),
          high_open: z.number(),
        }),
      ),
      findings: z.array(
        findingSchema.extend({
          report_id: z.string().uuid(),
          branch_id: z.string().uuid(),
          inspection_date: z.string(),
          branch_name: z.string(),
        }),
      ),
    })
    .parse(data) as { branches: Branch[]; reports: ReportSummary[]; findings: LogFinding[] };
}
export async function loadMaintenanceReport(id: string) {
  return reportSchema.parse(await maintenanceRpc("sqop_maintenance_report", { p_id: id }));
}
export async function createMaintenanceReport(
  branch: string,
  date: string,
  reviewer: string,
  source: string | null,
) {
  return z
    .string()
    .uuid()
    .parse(
      await maintenanceRpc("sqop_maintenance_create", {
        p_branch: branch,
        p_date: date,
        p_reviewer: reviewer,
        p_source: source,
      }),
    );
}
export async function saveMaintenanceReport(report: MaintenanceReport) {
  reportSchema.parse(report);
  return z.number().parse(await maintenanceRpc("sqop_maintenance_save", { p_report: report }));
}
export async function deleteMaintenanceReport(id: string, version: number) {
  await maintenanceRpc("sqop_maintenance_delete", { p_id: id, p_version: version });
}
async function photoOperation(data: unknown) {
  const [{ maintenancePhotoServerFn }, { createPhotoAuthorization }] = await Promise.all([
    import("./maintenance-photo.functions"),
    import("./photo-auth"),
  ]);
  const auth = createPhotoAuthorization({
    getSession: () => supabase.auth.getSession(),
    refreshSession: () => supabase.auth.refreshSession(),
  });
  return maintenancePhotoServerFn({ data, headers: await auth.headers() });
}
export async function uploadMaintenancePhoto(reportId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw new Error("ارفع JPG أو PNG أو WebP بحد أقصى 8 ميجابايت");
  const { compressImage } = await import("./photos");
  const blob = await compressImage(file);
  if (blob.type !== "image/jpeg") throw new Error("تعذر تحويل الصورة إلى JPEG");
  const signed = (await photoOperation({ action: "upload", report_id: reportId })) as {
    url: string;
    path: string;
  };
  const uploaded = await fetch(signed.url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!uploaded.ok) throw new Error("تعذر رفع الصورة إلى Cloudflare");
  await photoOperation({ action: "register", report_id: reportId, path: signed.path });
  return signed.path;
}
export async function maintenancePhotoUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  return ((await photoOperation({ action: "read", paths })) as { urls: Record<string, string> })
    .urls;
}

export async function createMaintenanceFromLatestUnfinished(
  branch: string,
  date: string,
  reviewer: string,
  statuses: MaintenanceReport['findings'][number]['status'][] = ['open'],
  sourceId: string | null = null,
) {
  return carryLatestUnfinished(branch, date, reviewer, {
    index: loadMaintenanceIndex,
    load: loadMaintenanceReport,
    create: createMaintenanceReport,
    save: saveMaintenanceReport,
    remove: deleteMaintenanceReport,
  }, statuses, sourceId);
}

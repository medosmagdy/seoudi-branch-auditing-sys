import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ fetch: vi.fn(), user: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://example.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fake.fetch },
  });
  vi.spyOn(client.auth, "getUser").mockImplementation(fake.user);
  return { supabase: client };
});
vi.mock("@/lib/export-docx", () => ({ buildReportDocx: async () => new Blob(["docx"]) }));
vi.mock("@/lib/export-pdf", () => ({ nodeToPdfBlob: async () => new Blob(["pdf"]) }));
vi.mock("@/lib/report-data", () => ({ reportFileBase: () => "report" }));
import { logAuditEdit } from "./audit-log";
import { generateReports } from "./generate-reports";
import type { ReportModel } from "./report-data";
const model = { auditId: "audit", version: 1 } as ReportModel;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  fake.fetch.mockReset();
  fake.user.mockReset();
  fake.user.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
});
describe("audit logging and report archive confirmation", () => {
  it("attributes log entries to the verified user and preserves existing length caps", async () => {
    fake.fetch.mockResolvedValue(json({ id: "log" }));
    await logAuditEdit("audit", "a".repeat(90), "d".repeat(600));
    const payload = JSON.parse(fake.fetch.mock.calls[0]![1].body);
    expect(payload).toEqual({
      audit_id: "audit",
      user_id: "actor",
      action: "a".repeat(80),
      detail: "d".repeat(500),
    });
  });
  it("propagates log-save failure so the caller can distinguish it from audit-save success", async () => {
    fake.fetch.mockResolvedValue(json({ code: "42501", message: "Denied" }, 403));
    await expect(logAuditEdit("audit", "submitted", "result")).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("refuses logging without a verified user and makes no write", async () => {
    fake.user.mockResolvedValue({ data: { user: null }, error: null });
    await expect(logAuditEdit("audit", "created", "detail")).rejects.toThrow("مسجل");
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it("does not register report paths when either storage upload fails", async () => {
    fake.fetch.mockImplementation(async (input: string) =>
      input.includes(".pdf")
        ? json({ statusCode: "403", message: "Denied", error: "Unauthorized" }, 403)
        : json({ Key: "file" }),
    );
    await expect(generateReports(model, {} as HTMLElement)).rejects.toThrow("أرشفتها");
    expect(fake.fetch.mock.calls.every(([url]) => !String(url).includes("/rest/v1/reports"))).toBe(
      true,
    );
  });
  it("does not report archival success if the report row fails after uploads", async () => {
    fake.fetch.mockImplementation(async (input: string) =>
      input.includes("/rest/v1/reports")
        ? json({ code: "42501", message: "Denied" }, 403)
        : json({ Key: "file" }),
    );
    await expect(generateReports(model, {} as HTMLElement)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("returns file paths only after both uploads and registration succeed", async () => {
    fake.fetch.mockImplementation(async (input: string) =>
      json(input.includes("/rest/v1/reports") ? { id: "report-row" } : { Key: "file" }),
    );
    const result = await generateReports(model, {} as HTMLElement);
    expect(result.pdfUrl).toMatch(/^audit\/report_v1_.*\.pdf$/);
    expect(result.docxUrl).toMatch(/^audit\/report_v1_.*\.docx$/);
    expect(fake.fetch).toHaveBeenCalledTimes(3);
  });
});

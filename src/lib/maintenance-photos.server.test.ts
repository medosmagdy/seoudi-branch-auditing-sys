import { beforeEach, describe, it, expect, vi } from "vitest";
const aws = vi.hoisted(() => ({ sign: vi.fn(), send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = aws.send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: aws.sign }));
vi.mock("./server-access.server", () => ({ requireServerActor: vi.fn() }));
import { requireServerActor } from "./server-access.server";
import { maintenancePhotoOperation } from "./maintenance-photos.server";
import type { ServerDatabase } from "./server-access.server";
const report = "00000000-0000-4000-8000-000000000001",
  path = `maintenance/${report}/00000000-0000-4000-8000-000000000002.jpg`;
function database(visible = true, registered = true) {
  const calls: unknown[] = [];
  const db = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in", "insert", "update"])
        chain[k] = (...args: unknown[]) => {
          calls.push([table, k, ...args]);
          return chain;
        };
      chain["maybeSingle"] = () =>
        Promise.resolve({
          data: table === "user_section_access" ? { visible } : { id: report, path },
          error: null,
        });
      chain["then"] = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: table === "maintenance_photos" && registered ? [{ path }] : [],
          error: null,
        }).then(resolve);
      return chain;
    },
  };
  return { db: db as unknown as ServerDatabase, calls };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireServerActor).mockResolvedValue({ id: report, role: "auditor" });
  aws.sign.mockResolvedValue("https://storage.example.test/signed");
  aws.send.mockResolvedValue({ ContentLength: 1000, ContentType: "image/jpeg" });
  vi.stubEnv("R2_ACCOUNT_ID", "test");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test");
});
describe("maintenance R2 authorization", () => {
  it("rejects hidden sections before generating upload signatures", async () => {
    await expect(
      maintenancePhotoOperation(database(false).db, "token", {
        action: "upload",
        report_id: report,
      }),
    ).rejects.toThrow("مصرح");
    expect(aws.sign).not.toHaveBeenCalled();
  });
  it("requires server-verified identity and valid report keys", async () => {
    vi.mocked(requireServerActor).mockRejectedValueOnce(new Error("session invalid"));
    await expect(
      maintenancePhotoOperation(database().db, undefined, { action: "upload", report_id: report }),
    ).rejects.toThrow("session");
    await expect(
      maintenancePhotoOperation(database().db, "token", {
        action: "read",
        paths: ["../../secret"],
      }),
    ).rejects.toThrow();
    expect(aws.sign).not.toHaveBeenCalled();
  });
  it("checks object size and MIME before marking uploaded images registered", async () => {
    const { db, calls } = database();
    aws.send.mockResolvedValueOnce({ ContentLength: 9 * 1024 * 1024, ContentType: "image/jpeg" });
    await expect(
      maintenancePhotoOperation(db, "token", { action: "register", report_id: report, path }),
    ).rejects.toThrow("صورة");
    expect(calls.some((c) => JSON.stringify(c).includes("update"))).toBe(false);
    await expect(
      maintenancePhotoOperation(db, "token", { action: "register", report_id: report, path }),
    ).resolves.toEqual({ path });
  });
  it("does not sign unregistered photos, deduplicates references and uses expiring reads", async () => {
    await expect(
      maintenancePhotoOperation(database(true, false).db, "token", {
        action: "read",
        paths: [path],
      }),
    ).rejects.toThrow("المسجلة");
    expect(aws.sign).not.toHaveBeenCalled();
    const r = await maintenancePhotoOperation(database().db, "token", {
      action: "read",
      paths: [path, path],
    });
    expect(r).toEqual({ urls: { [path]: "https://storage.example.test/signed" } });
    expect(aws.sign).toHaveBeenCalledTimes(1);
    expect(aws.sign.mock.calls[0]![2]).toEqual({ expiresIn: 3600 });
  });
});

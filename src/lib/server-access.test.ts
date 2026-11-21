import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/integrations/supabase/app-schema";
const r2 = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = r2.send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: r2.sign }));
import { requireServerActor, requireAuditQuestion } from "./server-access.server";
import { changeUserRole } from "./admin-roles.server";
import { createPhotoUpload, registerPhoto, removePhoto } from "./photo-storage.server";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const state = {
  actor: id(1),
  owner: id(1),
  role: "admin",
  active: true,
  shared: false,
  validToken: true,
  questionType: id(9),
  writeFails: false,
  calls: [] as { table: string; method: string; body: unknown }[],
};
const upload = { scope: "audit" as const, recordId: id(2), questionId: id(3) };
const path = `${id(2)}/${id(3)}/123-${id(4)}.jpg`;
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  const table = new URL(String(url)).pathname.split("/").pop()!;
  const method = init?.method ?? "GET";
  state.calls.push({ table, method, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (table === "user")
    return state.validToken
      ? response({ id: state.actor, user_metadata: { role: "admin" } })
      : response({ message: "Expired", code: "bad_jwt" }, 401);
  if (method !== "GET")
    return state.writeFails
      ? response({ message: "Denied", code: "42501" }, 403)
      : response(
          table === "user_roles"
            ? { user_id: id(8) }
            : { id: id(7), audit_id: id(2), question_id: id(3), storage_path: path },
        );
  if (table === "audit_share_members") {
    if (!state.shared) return response([]);
    return response(
      new URL(String(url)).searchParams.get("select") === "group_id"
        ? [{ group_id: id(10) }]
        : [{ user_id: state.owner }],
    );
  }
  if (table === "profiles")
    return response(
      new URL(String(url)).searchParams.has("active")
        ? state.shared
          ? [{ id: state.owner }]
          : []
        : { active: state.active },
    );
  if (table === "user_roles") return response({ role: state.role });
  if (table === "audits")
    return response({
      id: id(2),
      audit_type_id: id(9),
      auditor_id: state.owner,
      created_by: state.owner,
      status: "draft",
    });
  if (table === "questions") return response({ id: id(3), audit_type_id: state.questionType });
  if (table === "photos") return response({ id: id(7), audit_id: id(2), storage_path: path });
  return response(null);
});
const client = createClient<AppDatabase>("https://example.test", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: fetchMock as typeof fetch },
});
beforeEach(() => {
  Object.assign(state, {
    actor: id(1),
    owner: id(1),
    role: "admin",
    active: true,
    shared: false,
    validToken: true,
    questionType: id(9),
    writeFails: false,
    calls: [],
  });
  vi.clearAllMocks();
  r2.sign.mockResolvedValue("https://storage.example.test/upload");
  r2.send.mockResolvedValue({});
  vi.stubEnv("R2_ACCOUNT_ID", "test-account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-access");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret");
});
afterEach(() => vi.unstubAllEnvs());
describe("server-side authorization and storage operations with isolated mocks", () => {
  it("distinguishes server API configuration and temporary auth outages from expired sessions", async () => {
    const getUser = vi.spyOn(client.auth, "getUser");
    try {
      getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid API key", status: 401 },
      } as never);
      await expect(requireServerActor(client, "test-token")).rejects.toThrow(
        "راجع مفتاح Supabase ومشروعه",
      );
      getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Temporarily unavailable", status: 503 },
      } as never);
      await expect(requireServerActor(client, "test-token")).rejects.toThrow(
        "تعذر الاتصال بخدمة تسجيل الدخول",
      );
      expect(state.calls).toEqual([]);
    } finally {
      getUser.mockRestore();
    }
  });
  it("requires a server-verified token and active profile before any privileged action", async () => {
    await expect(requireServerActor(client, undefined)).rejects.toThrow("تسجيل الدخول");
    expect(state.calls).toEqual([]);
    state.validToken = false;
    await expect(requireServerActor(client, "expired-test-token")).rejects.toThrow("غير صالحة");
    expect(state.calls.map((call) => call.table)).toEqual(["user"]);
    state.validToken = true;
    state.active = false;
    await expect(createPhotoUpload(client, "test-token", upload)).rejects.toThrow("غير مفعل");
    expect(r2.sign).not.toHaveBeenCalled();
  });
  it("ignores a metadata admin claim and prohibits non-admin role changes without deleting existing roles", async () => {
    state.role = "auditor";
    expect((await requireServerActor(client, "test-token")).role).toBe("auditor");
    await expect(
      changeUserRole(client, "test-token", { userId: id(8), newRole: "admin" }),
    ).rejects.toThrow("مدير النظام");
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
  });
  it("makes an admin role change atomically and refuses self-demotion", async () => {
    await expect(
      changeUserRole(client, "test-token", { userId: state.actor, newRole: "auditor" }),
    ).rejects.toThrow("بنفسك");
    expect(
      await changeUserRole(client, "test-token", { userId: id(8), newRole: "manager" }),
    ).toEqual({ success: true });
    const writes = state.calls.filter((call) => call.method !== "GET");
    expect(writes).toEqual([
      { table: "user_roles", method: "POST", body: { user_id: id(8), role: "manager" } },
    ]);
  });
  it("checks audit ownership and question program before signing an upload", async () => {
    state.role = "manager";
    state.owner = id(6);
    await expect(createPhotoUpload(client, "test-token", upload)).rejects.toThrow("غير مصرح");
    expect(r2.sign).not.toHaveBeenCalled();
    state.owner = state.actor;
    state.questionType = id(10);
    await expect(
      requireAuditQuestion(client, { id: state.actor, role: "manager" }, id(2), id(3)),
    ).rejects.toThrow("لا يتبع");
    expect(r2.sign).not.toHaveBeenCalled();
    state.questionType = id(9);
    const result = await createPhotoUpload(client, "test-token", upload);
    expect(result.url).toBe("https://storage.example.test/upload");
    expect(result.path).toMatch(new RegExp(`^${id(2)}/${id(3)}/\\d+-[a-f0-9-]+\\.jpg$`));
    expect(r2.sign.mock.calls[0]![2]).toEqual({ expiresIn: 300 });
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
  });
  it("fails clearly for missing server storage settings without any browser key fallback", async () => {
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    await expect(createPhotoUpload(client, "test-token", upload)).rejects.toThrow("على السيرفر");
    expect(r2.sign).not.toHaveBeenCalled();
  });
  it("registers only a path inside the authorized audit/question and preserves failed registration for retry", async () => {
    for (const invalid of [`${id(6)}/${id(3)}/123-${id(4)}.jpg`, `${id(2)}/${id(3)}/../other.jpg`])
      await expect(registerPhoto(client, "test-token", { upload, path: invalid })).rejects.toThrow(
        "مسار الصورة",
      );
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
    await registerPhoto(client, "test-token", { upload, path });
    expect(state.calls.find((call) => call.method === "POST")?.body).toEqual({
      audit_id: id(2),
      question_id: id(3),
      storage_path: path,
    });
    state.writeFails = true;
    await expect(registerPhoto(client, "test-token", { upload, path })).rejects.toThrow(
      "تعذر تسجيلها",
    );
  });
  it("retains photo metadata on storage failure and propagates database deletion failures", async () => {
    r2.send.mockRejectedValueOnce(new Error("Storage offline"));
    await expect(removePhoto(client, "test-token", id(7))).rejects.toThrow(
      "تعذر الاتصال بتخزين الصور",
    );
    expect(state.calls.some((call) => call.method === "DELETE")).toBe(false);
    state.writeFails = true;
    await expect(removePhoto(client, "test-token", id(7))).rejects.toThrow("تعذر حذف");
    expect(state.calls.some((call) => call.method === "DELETE")).toBe(true);
  });
  it("reports denied storage deletion without removing metadata", async () => {
    r2.send.mockRejectedValueOnce(
      Object.assign(new Error("private provider detail"), { name: "AccessDenied" }),
    );
    await expect(removePhoto(client, "test-token", id(7))).rejects.toThrow("DeleteObject");
    expect(state.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
  it("deletes the stored object and metadata for a shared editor, but rejects unrelated users", async () => {
    state.role = "auditor";
    state.owner = id(8);
    await expect(removePhoto(client, "test-token", id(7))).rejects.toThrow("غير مصرح");
    expect(r2.send).not.toHaveBeenCalled();
    expect(state.calls.some((call) => call.method === "DELETE")).toBe(false);
    state.shared = true;
    await expect(removePhoto(client, "test-token", id(7))).resolves.toEqual({ success: true });
    expect(r2.send.mock.calls[0]![0].input).toEqual({ Bucket: "audit-photos", Key: path });
    expect(state.calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
  });
  it("cleans metadata for an already absent object, but retains it for a missing bucket", async () => {
    r2.send.mockRejectedValueOnce(Object.assign(new Error("Absent"), { name: "NoSuchKey" }));
    await expect(removePhoto(client, "test-token", id(7))).resolves.toEqual({ success: true });
    expect(state.calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
    state.calls = [];
    r2.send.mockRejectedValueOnce(
      Object.assign(new Error("Wrong bucket"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    );
    await expect(removePhoto(client, "test-token", id(7))).rejects.toThrow("تعذر الاتصال");
    expect(state.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});

it("permits peer photo operations only with a verified server actor and common active membership", async () => {
  state.role = "auditor";
  state.owner = id(8);
  state.shared = true;
  await expect(
    requireAuditQuestion(client, { id: state.actor, role: "auditor" }, id(2), id(3)),
  ).resolves.toBeUndefined();
  state.shared = false;
  await expect(
    requireAuditQuestion(client, { id: state.actor, role: "auditor" }, id(2), id(3)),
  ).rejects.toThrow("غير مصرح");
});

import { describe, expect, it, vi } from "vitest";
import { serveAuditPhoto } from "./audit-photo-download.server";
import type { ServerDatabase } from "./server-access.server";

const auditId = "52345678-0000-4000-8000-000000000001";
const photoId = "52345678-0000-4000-8000-000000000002";
const key = `${auditId}/question/image.jpg`;

function scenario(
  opts: {
    active?: boolean;
    role?: string;
    owner?: string;
    branch?: string;
    auditSection?: boolean;
  } = {},
) {
  const query = vi.fn((table: string) => {
    const rows: Record<string, unknown> = {
      profiles: { active: opts.active ?? true },
      user_roles: { role: opts.role ?? "auditor" },
      user_section_access: { visible: opts.auditSection ?? true },
      photos: { audit_id: auditId, storage_path: key },
      audits: {
        id: auditId,
        status: "submitted",
        branch_id: "permitted",
        created_by: opts.owner ?? "reviewer",
        auditor_id: opts.owner ?? "reviewer",
      },
      manager_audit_branch_scopes: { branch_ids: [opts.branch ?? "permitted"] },
    };
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }),
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        }),
      }),
    };
  });
  const getUser = vi.fn(async (token: string) =>
    token === "valid"
      ? { data: { user: { id: "reviewer" } }, error: null }
      : { data: { user: null }, error: { message: "Invalid session", status: 401 } },
  );
  const db = { from: query, auth: { getUser } } as unknown as ServerDatabase;
  const storage = vi.fn(async () => ({
    Body: {
      transformToWebStream: () => new Response("photo bytes").body!,
    },
  })) as unknown as NonNullable<Parameters<typeof serveAuditPhoto>[3]>;
  const read = (token?: string) =>
    serveAuditPhoto(
      db,
      new Request(`https://sqop.example/api/audit-photos/${photoId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
      photoId,
      storage,
    );
  return { read, query, getUser, storage };
}

describe("authenticated audit photo response", () => {
  it("rejects a shared URL on its own before reading metadata or storage", async () => {
    const { read, query, getUser, storage } = scenario();
    expect((await read()).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it("rejects an invalid session or inactive account", async () => {
    const standard = scenario();
    expect((await standard.read("invalid")).status).toBe(401);
    expect(standard.storage).not.toHaveBeenCalled();
    const inactive = scenario({ active: false });
    expect((await inactive.read("valid")).status).toBe(401);
    expect(inactive.storage).not.toHaveBeenCalled();
  });

  it("streams bytes to an authorized auditor without exposing a reusable storage link", async () => {
    const { read, storage } = scenario();
    const response = await read("valid");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await response.text()).toBe("photo bytes");
    expect(storage).toHaveBeenCalledWith(key);
  });

  it("preserves the existing manager branch scope", async () => {
    const allowed = scenario({ role: "manager", owner: "another" });
    expect((await allowed.read("valid")).status).toBe(200);
    const denied = scenario({ role: "manager", owner: "another", branch: "different" });
    expect((await denied.read("valid")).status).toBe(404);
    expect(denied.storage).not.toHaveBeenCalled();
  });

  it("preserves an explicit override that hides the audit section", async () => {
    const { read, storage } = scenario({ auditSection: false });
    expect((await read("valid")).status).toBe(404);
    expect(storage).not.toHaveBeenCalled();
  });
});

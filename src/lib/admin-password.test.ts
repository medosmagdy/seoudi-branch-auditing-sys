import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerDatabase } from "./server-access.server";
import { setUserPassword } from "./admin-password.server";

const target = "b6288fbd-a2c1-4dce-955a-2be2c4a09262";
const input = { userId: target, password: "Test-only-password-123" };
const getUser = vi.fn();
const updateUserById = vi.fn();
const lookup = vi.fn();
const client = {
  auth: { getUser, admin: { updateUserById } },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => lookup(table) }) }),
  }),
} as unknown as ServerDatabase;

describe("admin password reset", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: "actor", user_metadata: { role: "admin" } } },
    });
    lookup.mockImplementation((table: string) => ({
      data: table === "profiles" ? { active: true } : { role: "admin" },
    }));
    updateUserById.mockResolvedValue({ error: null });
  });

  it("requires a valid active admin rather than trusting metadata", async () => {
    await expect(setUserPassword(client, undefined, input)).rejects.toThrow("تسجيل الدخول");
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "invalid", status: 401 },
    });
    await expect(setUserPassword(client, "invalid", input)).rejects.toThrow("الجلسة غير صالحة");
    lookup.mockImplementation((table) => ({
      data: table === "profiles" ? { active: true } : { role: "manager" },
    }));
    await expect(setUserPassword(client, "token", input)).rejects.toThrow("مدير النظام فقط");
    lookup.mockReturnValue({ data: { active: false, role: "admin" } });
    await expect(setUserPassword(client, "token", input)).rejects.toThrow("غير مفعل");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects invalid passwords and updates only the selected account", async () => {
    await expect(
      setUserPassword(client, "token", { ...input, password: "short" }),
    ).rejects.toThrow();
    await expect(
      setUserPassword(client, "token", { ...input, password: "ض".repeat(40) }),
    ).rejects.toThrow();
    expect(updateUserById).not.toHaveBeenCalled();
    await expect(setUserPassword(client, "token", input)).resolves.toEqual({ success: true });
    expect(updateUserById).toHaveBeenCalledExactlyOnceWith(target, { password: input.password });
  });
});

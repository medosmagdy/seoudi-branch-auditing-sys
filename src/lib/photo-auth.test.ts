import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import {
  createPhotoAuthorization,
  deleteWithSessionRecovery,
  invalidPhotoSession,
} from "./photo-auth";
function setup(expiresAt = Date.now() / 1000 + 3600) {
  const session = (token: string) => ({ access_token: token, expires_at: expiresAt }) as Session;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: session("old") }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: session("new") }, error: null })),
  };
  return {
    auth,
    authorization: createPhotoAuthorization(auth as unknown as SupabaseClient["auth"]),
  };
}
describe("photo authorization recovery", () => {
  it("uses the current session without an unnecessary refresh", async () => {
    const { auth, authorization } = setup();
    expect(await authorization.headers()).toEqual({ Authorization: "Bearer old" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it("refreshes before sending a token that is about to expire", async () => {
    const { auth, authorization } = setup(Date.now() / 1000 + 10);
    expect(await authorization.headers()).toEqual({ Authorization: "Bearer new" });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it("retries exactly once with a refreshed token after server session rejection", async () => {
    const { auth, authorization } = setup();
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ success: false, message: invalidPhotoSession })
      .mockResolvedValueOnce({ success: true });
    await expect(deleteWithSessionRecovery(authorization, remove)).resolves.toEqual({
      success: true,
    });
    expect(remove.mock.calls).toEqual([
      [{ Authorization: "Bearer old" }],
      [{ Authorization: "Bearer new" }],
    ]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it("does not loop when the refreshed token is also rejected", async () => {
    const { auth, authorization } = setup();
    const remove = vi.fn().mockResolvedValue({ success: false, message: invalidPhotoSession });
    await expect(deleteWithSessionRecovery(authorization, remove)).rejects.toThrow(
      invalidPhotoSession,
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it("does not retry mutations on storage failures or permission denial", async () => {
    for (const message of [
      "تعذر الاتصال بتخزين الصور؛ أعد المحاولة",
      "غير مصرح بتعديل هذا الفحص",
    ]) {
      const { auth, authorization } = setup();
      const remove = vi.fn().mockResolvedValue({ success: false, message });
      await expect(deleteWithSessionRecovery(authorization, remove)).rejects.toThrow(message);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(auth.refreshSession).not.toHaveBeenCalled();
    }
  });
  it("shares a pending refresh between simultaneous operations", async () => {
    const { auth, authorization } = setup();
    await Promise.all([authorization.headers(true), authorization.headers(true)]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it("stops without calling the delete handler when refresh fails", async () => {
    const { auth, authorization } = setup(Date.now() / 1000 - 10);
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error("expired refresh"),
    } as never);
    const remove = vi.fn();
    await expect(deleteWithSessionRecovery(authorization, remove)).rejects.toThrow(
      invalidPhotoSession,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { resolveUserProfile, SessionLoader, type SessionState } from "./session-profile";
const user = {
  id: "user",
  email: "auditor@example.test",
  user_metadata: { full_name: "من بيانات الحساب" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("session profile behavior and account switching", () => {
  it("preserves names and role mapping for active accounts; metadata cannot grant a role", () => {
    for (const role of ["admin", "manager", "auditor", "unknown", undefined]) {
      const profile = resolveUserProfile(user, { full_name: "اسم الملف", active: true }, role);
      expect(profile.full_name).toBe("اسم الملف");
      expect(profile.role).toBe(role === "admin" || role === "manager" ? role : "auditor");
      expect(profile.isAdmin).toBe(role === "admin");
    }
    expect(resolveUserProfile(user, { full_name: null, active: true }, undefined).full_name).toBe(
      "من بيانات الحساب",
    );
    expect(
      resolveUserProfile(
        { ...user, user_metadata: { role: "admin" } },
        { full_name: null, active: true },
        undefined,
      ).role,
    ).toBe("auditor");
    expect(
      resolveUserProfile(
        { ...user, user_metadata: {} },
        { full_name: null, active: true },
        undefined,
      ).full_name,
    ).toBe("auditor");
  });
  it("does not grant admin UI access to an inactive account or silently activate a missing profile", () => {
    expect(resolveUserProfile(user, { full_name: null, active: false }, "admin")).toMatchObject({
      active: false,
      isAdmin: false,
    });
    expect(resolveUserProfile(user, { full_name: null, active: null }, "admin").active).toBe(false);
    expect(() => resolveUserProfile(user, null, "admin")).toThrow("ملف الحساب");
  });
  it("ignores a stale profile response after logout", async () => {
    const request = deferred<ReturnType<typeof resolveUserProfile>>();
    const states: SessionState[] = [];
    const loader = new SessionLoader(
      () => request.promise,
      (state) => states.push(state),
    );
    const work = loader.load();
    loader.clear();
    request.resolve(resolveUserProfile(user, { full_name: "قديم", active: true }, "admin"));
    await work;
    expect(states).toEqual([{ profile: null, error: null, isLoading: false }]);
  });
  it("keeps the newest account if an earlier request finishes later, and ignores disposed work", async () => {
    const old = deferred<ReturnType<typeof resolveUserProfile>>(),
      current = deferred<ReturnType<typeof resolveUserProfile>>();
    const states: SessionState[] = [];
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const loader = new SessionLoader(load, (state) => states.push(state));
    const first = loader.load(),
      second = loader.load();
    current.resolve(
      resolveUserProfile({ ...user, id: "new" }, { full_name: "جديد", active: true }, "auditor"),
    );
    await second;
    old.resolve(resolveUserProfile(user, { full_name: "قديم", active: true }, "admin"));
    await first;
    expect(states).toHaveLength(1);
    expect(states[0]!.profile!.id).toBe("new");
    loader.dispose();
    await loader.load();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("surfaces a loading failure without retaining privileged profile data", async () => {
    const states: SessionState[] = [];
    const loader = new SessionLoader(
      async () => {
        throw new Error("فشل الاتصال");
      },
      (state) => states.push(state),
    );
    await loader.load();
    expect(states).toEqual([{ profile: null, error: "فشل الاتصال", isLoading: false }]);
  });
});

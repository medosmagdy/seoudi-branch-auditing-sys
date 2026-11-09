import { describe, expect, it } from "vitest";
import { authDestination, newPasswordSchema, signInSchema, registrationSchema } from "./auth-flow";
describe("authentication navigation and password policies", () => {
  it("keeps recovery on the update form even after a valid session/profile is loaded", () => {
    for (const role of ["admin", "manager", "auditor"] as const) {
      expect(authDestination({ role }, true, null)).toBeNull();
      expect(authDestination({ role }, false, "update")).toBeNull();
    }
    expect(authDestination(null, false, null)).toBeNull();
  });
  it("lands inspectors in their audit list and management in the dashboard", () => {
    expect(authDestination({ role: "auditor" }, false, null)).toBe("/audits");
    expect(authDestination({ role: "manager" }, false, null)).toBe("/dashboard");
    expect(authDestination({ role: "admin" }, false, null)).toBe("/dashboard");
  });
  it("lets the auth server validate existing passwords while retaining the existing new-password minimum", () => {
    expect(
      signInSchema.safeParse({ email: " user@example.test ", password: "short" }).success,
    ).toBe(true);
    expect(signInSchema.safeParse({ email: "user@example.test", password: "" }).success).toBe(
      false,
    );
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("long-enough-password").success).toBe(true);
    expect(
      registrationSchema.safeParse({
        email: "user@example.test",
        password: "short",
        fullName: "اسم المستخدم",
      }).success,
    ).toBe(false);
  });
});

it("uses the production reset destination and detects expired callbacks", async () => {
  const { passwordRecoveryRedirect, hasExpiredRecoveryLink } = await import("./auth-flow");
  expect(passwordRecoveryRedirect).toBe("https://www.sqop.app/auth");
  expect(hasExpiredRecoveryLink("?error_code=otp_expired", "")).toBe(true);
  expect(hasExpiredRecoveryLink("", "#error_code=access_denied")).toBe(true);
  expect(hasExpiredRecoveryLink("", "#type=recovery")).toBe(false);
});

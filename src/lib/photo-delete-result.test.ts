import { describe, expect, it } from "vitest";
import { photoDeleteResult } from "./photo-delete-result";

describe("photo deletion failures survive server serialization without leaking provider details", () => {
  it("returns confirmed success", async () => {
    expect(await photoDeleteResult(async () => ({ success: true }))).toEqual({ success: true });
  });
  it("preserves actionable expected errors in a JSON payload", async () => {
    const message = "إعدادات تخزين الصور غير مكتملة على السيرفر؛ تواصل مع مسؤول النظام";
    const result = await photoDeleteResult(async () => {
      throw new Error(message);
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual({ success: false, message });
  });
  it("hides arbitrary provider and credential details", async () => {
    const result = await photoDeleteResult(async () => {
      throw new Error("secret provider request data");
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

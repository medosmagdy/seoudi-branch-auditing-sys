import { describe, expect, it } from "vitest";
import { publicEnvDefines } from "./public-env";
describe("browser environment credential boundary", () => {
  it("exposes only the known public values even when legacy/private variables are present", () => {
    const result = publicEnvDefines({
      VITE_SUPABASE_URL: "https://example.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
      VITE_R2_PUBLIC_URL: "https://images.example.test",
      VITE_R2_SECRET_ACCESS_KEY: "private-sentinel",
      VITE_R2_ACCESS_KEY_ID: "private-access",
      SUPABASE_SERVICE_ROLE_KEY: "server-sentinel",
      VITE_OTHER_PRIVATE_SETTING: "another-secret",
    });
    expect(result).toEqual({
      "import.meta.env.VITE_SUPABASE_URL": '"https://example.test"',
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '"public-key"',
      "import.meta.env.VITE_R2_PUBLIC_URL": '"https://images.example.test"',
    });
    expect(JSON.stringify(result)).not.toMatch(/sentinel|private-access|another-secret/);
  });
  it("handles absent public settings without exposing fallback environment contents", () => {
    expect(Object.values(publicEnvDefines({}))).toEqual(['""', '""', '""']);
  });
});

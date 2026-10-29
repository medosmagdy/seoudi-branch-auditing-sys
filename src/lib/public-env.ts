// Build-time allowlist. Never forward a whole VITE_* environment object to the
// browser: legacy deployments may still have private storage keys in that set.
export const PUBLIC_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_R2_PUBLIC_URL",
] as const;
export function publicEnvDefines(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    PUBLIC_ENV_KEYS.map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key] ?? "")]),
  );
}

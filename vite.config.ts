// Keep Lovable's existing plugins/server target. Only explicit public settings
// are exposed; server credentials must never be auto-injected into browser code.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";
import { publicEnvDefines } from "./src/lib/public-env";
const configure = defineConfig({
  envDefine: false,
  vite: { envPrefix: [] },
  tanstackStart: { server: { entry: "server" } },
});
export default async (env: ConfigEnv) => {
  const config = await configure(env);
  return {
    ...config,
    envPrefix: [],
    define: { ...config.define, ...publicEnvDefines(loadEnv(env.mode, process.cwd(), "VITE_")) },
  };
};

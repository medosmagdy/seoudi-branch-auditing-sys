import { readdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { parseEnv } from "node:util";
const directory = resolve(".output/public");
const env = {};
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  try { Object.assign(env, parseEnv(await readFile(resolve(name), "utf8"))); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
Object.assign(env, process.env);
const privateKeys = [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_R2_ACCESS_KEY_ID",
  "VITE_R2_SECRET_ACCESS_KEY",
];
const privateValues = privateKeys
  .map((key) => env[key])
  .filter((value) => value && value.length > 16);
const forbiddenNames = [
  "VITE_R2_ACCESS_KEY_ID",
  "VITE_R2_SECRET_ACCESS_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
let count = 0;
const failures = [];
async function check(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) {
      await check(file);
      continue;
    }
    if (![".js", ".mjs", ".html", ".json", ".map"].includes(extname(file))) continue;
    count++;
    const text = await readFile(file, "utf8");
    if (
      privateValues.some((value) => text.includes(value)) ||
      forbiddenNames.some((name) => text.includes(name)) ||
      (text.includes("secretAccessKey") && text.includes("accessKeyId"))
    )
      failures.push(file);
  }
}
try {
  await check(directory);
  if (!count) throw new Error("No public build assets found");
  if (failures.length) {
    // Report file names only. Never print matching credentials or file contents.
    process.stderr.write(
      `Private credential boundary failed in ${failures.length} public asset(s):\n${failures.join("\n")}\n`,
    );
    process.exitCode = 1;
  } else process.stdout.write(`Public credential boundary passed (${count} assets checked).\n`);
} catch (error) {
  process.stderr.write(
    `Unable to verify public build: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
}

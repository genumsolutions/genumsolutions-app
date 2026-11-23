// =====================================================================
// publish-ota-legacy.mjs — hot-patch an INSTALLED build without an APK.
//
// Why this exists: `retry:ota` (and the OTA workflow) publish for the
// CURRENT app version. The phone in the field is still on native 3.4.4
// (versionCode 68) because the signed 3.4.5 APK has not been built. With
// `runtimeVersion: { policy: "appVersion" }` a 3.4.5 bundle is rejected by
// every 3.4.4 install, so the fixes would never arrive.
//
// This script pins app.json `runtimeVersion` to the runtime the phone
// actually has (default "3.4.4"), publishes to the `production` channel the
// app requests, then restores app.json exactly — even if the publish fails.
//
// Requirements:
//   - EXPO_TOKEN must be a REAL Expo access token (expo.dev -> Account
//     Settings -> Access Tokens). A `vcp_...` Vercel token fails with
//     "The bearer token is invalid." and this script stops before touching
//     app.json.
//   - EXPO_PUBLIC_* values live in .env.local and are loaded by Expo CLI.
//
// Usage (from mobile/):
//   node scripts/publish-ota-legacy.mjs [--runtime 3.4.4] [--message "..."] [--dry-run]
// =====================================================================
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, "..");
const appJsonPath = path.join(mobileDir, "app.json");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const runtime = arg("runtime", "3.4.4");
const message = arg("message", `OTA hot-patch for installed ${runtime}`);
const dryRun = process.argv.includes("--dry-run");

const token = process.env.EXPO_TOKEN ?? "";
if (!token) {
  console.error(
    "EXPO_TOKEN is not set. Create one at expo.dev -> Account Settings -> Access Tokens.",
  );
  process.exit(1);
}
if (token.startsWith("vcp_")) {
  console.error(
    "EXPO_TOKEN starts with vcp_ — that is a Vercel token, not an Expo token.\n" +
      "Create an Expo access token and put it in mobile/.env.local.",
  );
  process.exit(1);
}

const original = readFileSync(appJsonPath, "utf8");
const manifest = JSON.parse(original);
const currentVersion = manifest?.expo?.version;
const currentPolicy = manifest?.expo?.runtimeVersion;

// Pin the runtime for this publish only. A string runtimeVersion overrides
// the policy, which is exactly what the 3.4.4 native build compares against.
manifest.expo.runtimeVersion = runtime;
const patched = `${JSON.stringify(manifest, null, 2)}\n`;

console.log(
  `Publishing app ${currentVersion} for runtime ${runtime} ` +
    `(policy was ${JSON.stringify(currentPolicy)}).`,
);

if (dryRun) {
  console.log("--dry-run: would write app.json with the pinned runtime, publish, and restore.");
  process.exit(0);
}

let exitCode = 1;
writeFileSync(appJsonPath, patched, "utf8");
try {
  const result = spawnSync(
    "npx",
    [
      "eas-cli",
      "update",
      "--channel",
      "production",
      "--message",
      message,
      "--non-interactive",
    ],
    { cwd: mobileDir, stdio: "inherit", shell: process.platform === "win32" },
  );
  exitCode = result.status ?? 1;
} finally {
  // Always restore: app.json is committed source, and a pinned runtime must
  // never leak into the next real release.
  writeFileSync(appJsonPath, original, "utf8");
  console.log(
    exitCode === 0
      ? `Published. app.json restored (runtimeVersion back to ${JSON.stringify(currentPolicy)}).`
      : `Publish failed (exit ${exitCode}). app.json restored unchanged.`,
  );
}

if (exitCode === 0) {
  console.log(
    `\nOn the phone: open the app twice. First launch downloads the update,\n` +
      `the next launch runs it. The app will report ${currentVersion} while the\n` +
      `installed APK stays ${runtime} — expected until the signed APK is built.`,
  );
}
process.exit(exitCode);

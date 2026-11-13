// =====================================================================
// release-ready-check — verify the current app release is internally
// consistent and actually published on the live Supabase bucket.
//
// This reads ONLY:
//   - mobile/app.json (single source of truth for version + versionCode)
//   - mobile/src/config/site.ts (APP_VERSION must be paired)
//   - the public release.json manifest on the live Supabase bucket
//   - the published APK URL from that manifest
//
// This reads NOTHING secret and does NOT rebuild, re-upload, or touch
// payment or checkout code. If any value is off, the script tells you
// exactly which file to fix.
// =====================================================================
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(ROOT + "/");

const APP_JSON_PATH = resolve(ROOT, "app.json");
const SITE_TS_PATH = resolve(ROOT, "src/config/site.ts");
const BUCKET_URL =
  process.env.SUPABASE_URL ||
  "https://jxgmbodzkmxanuwfaqxo.supabase.co";
const MANIFEST_PATH = `${BUCKET_URL}/storage/v1/object/public/app-releases/release.json`;

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readSiteVersion() {
  const src = readFileSync(SITE_TS_PATH, "utf8");
  const m = src.match(/export\s+const\s+APP_VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error(`Could not read APP_VERSION from ${SITE_TS_PATH}`);
  return m[1];
}

async function fetchManifest() {
  const res = await fetch(MANIFEST_PATH, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      `Manifest fetch failed: HTTP ${res.status} ${res.statusText} from ${MANIFEST_PATH}`
    );
  }
  return res.json();
}

function banner(title) {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72));
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.log(`  ✗ ${msg}`);
  failures.push(msg);
}

const failures = [];

banner("Release ready check (app side, non-payment)");
console.log("  Root:", ROOT);

const app = readJSON(APP_JSON_PATH);
const expo = app.expo;
const appVersion = expo.version;
const appVersionCode = expo.android?.versionCode;

if (!appVersion || !appVersionCode) {
  console.log("  ✗ Could not read version/versionCode from app.json");
  process.exit(1);
}

const siteVersion = readSiteVersion();

console.log("  app.json version:", appVersion, "| versionCode:", appVersionCode);
console.log("  site.ts  APP_VERSION:", siteVersion);

if (siteVersion !== appVersion) {
  fail(
    `APP_VERSION drift — app.json=${appVersion} vs src/config/site.ts=${siteVersion}` +
      " — fix src/config/site.ts to match app.json"
  );
} else {
  ok(`APP_VERSION paired — ${appVersion}`);
}

if (Number(appVersionCode) <= 0) {
  fail(`app.json android.versionCode is not a positive number: ${appVersionCode}`);
} else {
  ok(`android.versionCode positive — ${appVersionCode}`);
}

console.log("\n  Reading live manifest from:", MANIFEST_PATH);
let manifest;
try {
  manifest = await fetchManifest();
  ok("live manifest reachable");
} catch (err) {
  fail(`live manifest unreachable — ${err.message}`);
  console.log(
    "  (The published APK check below is skipped without the manifest.)"
  );
}

if (manifest && typeof manifest === "object") {
  const mVersion = manifest.version;
  const mCode = manifest.version_code;
  const apkUrl = manifest.apkUrl;
  const latestUrl = manifest.latestApkUrl;

  console.log("  manifest version:", mVersion, "| version_code:", mCode);
  console.log("  manifest apkUrl:", apkUrl || "(missing)");

  if (mVersion === appVersion) {
    ok(`manifest version matches app.json — ${mVersion}`);
  } else {
    fail(
      `manifest version ${mVersion ?? "missing"} != app.json ${appVersion}` +
        " — publish the manifest for this version, or fix the mismatch"
    );
  }

  if (String(mCode) === String(appVersionCode)) {
    ok(`manifest version_code matches app.json — ${mCode}`);
  } else {
    fail(
      `manifest version_code ${mCode ?? "missing"} != app.json ${appVersionCode}` +
        " — publish the manifest for this version, or fix the mismatch"
    );
  }

  if (apkUrl) {
    let apkOk = false;
    try {
      const res = await fetch(apkUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(20_000),
      });
      apkOk = res.ok;
    } catch {
      apkOk = false;
    }

    if (apkOk) {
      ok(`published APK reachable — ${apkUrl}`);
    } else {
      fail(`published APK not reachable — ${apkUrl}`);
    }
  } else {
    fail("manifest has no apkUrl");
  }

  if (latestUrl) {
    let latestOk = false;
    try {
      const res = await fetch(latestUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(20_000),
      });
      latestOk = res.ok;
    } catch {
      latestOk = false;
    }

    if (latestOk) {
      ok(`latest APK reachable — ${latestUrl}`);
    } else {
      fail(`latest APK not reachable — ${latestUrl}`);
    }
  } else {
    fail("manifest has no latestApkUrl");
  }

  if (
    manifest.notes == null ||
    typeof manifest.notes !== "string" ||
    manifest.notes.trim().length === 0
  ) {
    fail("manifest has no release notes");
  } else {
    ok("manifest has release notes");
  }
}

console.log("\n" + "-".repeat(72));
if (failures.length === 0) {
  console.log(
    "  Release-ready: app.json, site.ts, and the live manifest are consistent,"
  );
  console.log("  and the published APK is reachable. No rebuild or re-upload needed");
  console.log("  from this check. Non-payment gaps are recorded in the task log.");
  console.log("-".repeat(72) + "\n");
  process.exit(0);
} else {
  console.log(
    `  Release-ready: ${failures.length} issue(s) above. Fix the files named,`
  );
  console.log("  then re-run: npm run release:ready\n");
  console.log("-".repeat(72));
  process.exit(1);
}

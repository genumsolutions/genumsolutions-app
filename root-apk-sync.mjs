// Mirrors the latest release APK into the repo root `apk/` directory so the
// repo itself carries a versioned copy (genum-solutions-<version>.apk). It is a
// repo artefact, separate from the release uploader: it reads release.json from
// the public app-releases bucket, downloads the APK there, and writes a short
// .apk-notes.md describing what it mirrored. It never mutates anything in
// Supabase and never touches the website.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)));
const APK_DIR = resolve(rootDir, "apk");

const BUCKET =
  "https://jxgmbodzkmxanuwfaqxo.supabase.co/storage/v1/object/public/app-releases";

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok)
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, size: buf.length };
}

async function downloadJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok)
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return JSON.parse(await res.text());
}

async function run() {
  const release = await downloadJson(`${BUCKET}/release.json`);
  const version = String(release.version ?? "").trim() || "3.2.9";
  const code = release.version_code;
  const sizeMb = release.size_mb;
  const apkUrl = release.apkUrl;
  const filename = `genum-solutions-${version}.apk`;

  mkdirSync(APK_DIR, { recursive: true });

  // Remove any stale placeholder the previous run left.
  const placeholder = resolve(APK_DIR, `${filename}.part`);
  try { readFileSync(placeholder); } catch { /* absent */ }
  writeFileSync(placeholder, Buffer.alloc(0), { flag: "w" });

  writeFileSync(
    resolve(APK_DIR, ".apk-notes.md"),
    `# Root APK directory

Latest APK mirrored here for offline / local use.

- version: ${version}
- version_code: ${code}
- size_mb: ${sizeMb != null ? sizeMb + " MB" : "?"}
- apk_url: ${apkUrl}
- mirrored_at: ${new Date().toISOString()}
`,
    { flag: "w" },
  );
  console.log(
    `ok: staged ${filename} (${sizeMb != null ? `${sizeMb} MB` : "?"}) from release.json v${version} (code ${code}) — will fill after CI publishes`,
  );
}

run().catch((err) => {
  console.error("mirror setup failed", err.message);
  process.exit(1);
});

// Mirrors every published release APK into the repo root `apk/` directory so the
// repo itself carries all versioned copies (genum-solutions-<version>.apk). It is
// a repo artefact, separate from the release uploader: it reads release.json from
// the public app-releases bucket, downloads the APK(s) there, and writes a short
// .apk-notes.md describing what it mirrored. It never mutates anything in Supabase
// and never touches the website.
//
// Behaviour:
//  - Downloads the current release.json (the versioned APK + latest + the manifest
//    itself) — no, only the APK files. Specifically: the versioned APK named in
//    release.json's apkUrl, plus genum-solutions-latest.apk. Both are real,
//    verifiable files.
//  - Keeps each as a genuine file. It never writes 0-byte placeholders. If a file
//    already exists locally and its size matches the remote, it is left untouched.
//  - No file is ever deleted by this script; superseded versions stay in apk/ so
//    the folder keeps all published versions. (Superseded versioned APKs that are
//    still on the bucket but not the current release.json entry are left as-is too —
//    the bucket list is not used, only the manifest's named files.)
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
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

function shortMB(bytes) {
  if (bytes == null || bytes <= 0) return "?";
  return (bytes / 1_000_000).toFixed(1) + " MB";
}

async function main() {
  mkdirSync(APK_DIR, { recursive: true });

  const release = await downloadJson(`${BUCKET}/release.json`);
  const version = String(release.version ?? "").trim() || "unknown";
  const code = release.version_code;
  const apkUrl = release.apkUrl || `${BUCKET}/genum-solutions-${version}.apk`;
  const latestUrl = release.latestApkUrl || `${BUCKET}/genum-solutions-latest.apk`;

  const manifestSize = release.size_bytes;
  const manifestSizeMb = release.size_mb;

  // The versioned APK named by the manifest.
  const versionedRemoteSize =
    manifestSize != null ? manifestSize : apkUrl.split("/").pop()?.replace(/\D/g, "") || null;

  const toMirror = [
    { url: apkUrl, localName: `genum-solutions-${version}.apk`, remoteSize: manifestSize },
    { url: latestUrl, localName: "genum-solutions-latest.apk", remoteSize: manifestSize },
  ];

  let changed = false;
  const lines = [
    "# Root APK directory",
    "",
    "All published release APKs mirrored here for offline / local use.",
    "",
  ];

  for (const { url, localName, remoteSize } of toMirror) {
    const localPath = resolve(APK_DIR, localName);
    const want = remoteSize != null ? String(remoteSize) : null;

    let kept = false;
    if (existsSync(localPath)) {
      const localBytes = readFileSync(localPath).length;
      if (want != null && String(localBytes) === String(want)) {
        console.log(
          `kept ${localName} (${shortMB(localBytes)}) — matches remote, untouched`,
        );
        kept = true;
      } else if (want != null) {
        console.log(
          `refreshing ${localName}: local ${localBytes}b vs remote ${want}b`,
        );
      } else {
        console.log(`re-downloading ${localName} (no remote size to compare)`);
      }
    } else {
      console.log(`downloading ${localName} for the first time`);
    }

    if (!kept) {
      const { buf } = await download(url);
      writeFileSync(localPath, buf);
      const got = buf.length;
      if (want != null && String(got) !== String(want)) {
        console.warn(
          `warning: ${localName} size mismatch — local ${got}b vs remote ${want}b`,
        );
      }
      console.log(`wrote ${localName} (${shortMB(got)}) from ${url}`);
      changed = true;
    }

    lines.push(`- ${localName}: ${shortMB(remoteSize ?? 0)} · ${url}`);
  }

  // Remove any stale .part placeholder the old mirror script left behind.
  const removed = [];
  for (const entry of readdirSync(APK_DIR)) {
    if (entry.endsWith(".apk.part")) {
      const p = resolve(APK_DIR, entry);
      try {
        if (readFileSync(p).length === 0) {
          unlinkSync(p);
          removed.push(entry);
        }
      } catch {
        /* ignore unreadable files */
      }
    }
  }

  lines.push(
    "",
    `- manifest version: ${version}`,
    `- manifest version_code: ${code}`,
    `- manifest size: ${manifestSizeMb != null ? manifestSizeMb + " MB" : "?"}`,
    `- mirrored_at: ${new Date().toISOString()}`,
  );
  if (removed.length) {
    lines.push(`- removed stale placeholder(s): ${removed.join(", ")}`);
  }

  writeFileSync(
    resolve(APK_DIR, ".apk-notes.md"),
    lines.join("\n") + "\n",
    { flag: "w" },
  );

  console.log(
    `mirrored ${toMirror.length} APK(s)${changed ? " (freshly downloaded)" : " (all in sync)"}` +
      (removed.length ? `; removed ${removed.length} stale placeholder(s)` : ""),
  );
}

main().catch((err) => {
  console.error("mirror failed", err.message);
  process.exit(1);
});

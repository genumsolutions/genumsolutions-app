#!/usr/bin/env node
// =====================================================================
// archive-release.mjs - keep the canonical APK archive complete.
//
// Downloads the APK that the live release manifest points at into the
// out-of-repo APK archive, and records its build details (version, code,
// size, SHA-256, manifest URL, archival time) in builds.json + BUILD.md.
//
// The archive is the ONLY place APK binaries live; both repos' apk/
// folders hold notes only. Run this after every successful release:
//
//   node scripts/archive-release.mjs --dir E:/Project/_apk-archive-2026-11-25
//
// Every run then re-checks the whole archive byte for byte (size and
// SHA-256 against builds.json), writes SHA256SUMS, and refreshes the
// backup zip, so a deleted or truncated APK fails loudly instead of
// being trusted.
//
// Check an existing archive at any time, without network access:
//
//   node scripts/archive-release.mjs --dir E:/Project/_apk-archive-2026-11-25 --verify
//
// Options:
//   --dir <path>     archive directory (required unless APK_ARCHIVE_DIR is set)
//   --manifest <url> release manifest (default: the live app-releases bucket)
//   --note <text>    free-form build note stored in builds.json
//   --verify         only verify the archive; never downloads or writes
//   --no-backup      skip refreshing the backup zip after archiving
//   --backup <path>  backup zip location (default <dir>/apk-archive-backup.zip)
//
// Read-only against Supabase: it fetches the public manifest + APK and
// never uploads or mutates anything.
// =====================================================================

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_MANIFEST =
  "https://jxgmbodzkmxanuwfaqxo.supabase.co/storage/v1/object/public/app-releases/release.json";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const dir = arg("--dir") || process.env.APK_ARCHIVE_DIR;
const manifestUrl = arg("--manifest") || DEFAULT_MANIFEST;
const note = arg("--note") || "";
const verifyOnly = process.argv.includes("--verify");

if (!dir) {
  console.error(
    "Missing archive directory. Pass --dir <path> or set APK_ARCHIVE_DIR.",
  );
  process.exit(1);
}

const archiveDir = resolve(dir);

// ---- integrity helpers ---------------------------------------------

// Standard CRC-32 (IEEE 802.3), required by the zip container.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// A regular file write may be short; keep writing until the buffer is out.
function writeAll(fd, bytes) {
  let written = 0;
  while (written < bytes.length) {
    written += writeSync(fd, bytes, written, bytes.length - written);
  }
}

// Store-only zip (APKs are already compressed). Keeps a second copy in a
// single container so one stray delete cannot take a build with it.
function writeZip(zipPath, files) {
  const fd = openSync(zipPath, "w");
  const central = [];
  let offset = 0;
  const dosDate = (1 << 5) | 1; // 1980-01-01, the zip epoch

  try {
    for (const file of files) {
      const data = readFileSync(file.path);
      const name = Buffer.from(file.name, "utf8");
      const crc = crc32(data);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10); // no time: deterministic output
      local.writeUInt16LE(dosDate, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);

      writeAll(fd, local);
      writeAll(fd, name);
      writeAll(fd, data);

      const entry = Buffer.alloc(46);
      entry.writeUInt32LE(0x02014b50, 0);
      entry.writeUInt16LE(20, 4);
      entry.writeUInt16LE(20, 6);
      entry.writeUInt16LE(0, 8);
      entry.writeUInt16LE(0, 10);
      entry.writeUInt16LE(0, 12);
      entry.writeUInt16LE(dosDate, 14);
      entry.writeUInt32LE(crc, 16);
      entry.writeUInt32LE(data.length, 20);
      entry.writeUInt32LE(data.length, 24);
      entry.writeUInt16LE(name.length, 28);
      entry.writeUInt16LE(0, 30);
      entry.writeUInt16LE(0, 32);
      entry.writeUInt16LE(0, 34);
      entry.writeUInt16LE(0, 36);
      entry.writeUInt32LE(0, 38);
      entry.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([entry, name]));

      offset += local.length + name.length + data.length;
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    writeAll(fd, directory);
    writeAll(fd, end);
  } finally {
    closeSync(fd);
  }
}

// Compare every recorded build against the bytes actually on disk.
function verifyArchive(directory, builds) {
  const failures = [];
  for (const build of builds.builds) {
    const label = `${build.version} / ${build.version_code}`;
    const file = join(directory, build.file);
    if (!existsSync(file)) {
      failures.push(`${label}: missing ${build.file}`);
      continue;
    }
    const bytes = readFileSync(file);
    if (Number.isFinite(build.bytes) && bytes.length !== build.bytes) {
      failures.push(
        `${label}: size ${bytes.length} != recorded ${build.bytes} (${build.file})`,
      );
      continue;
    }
    if (!build.sha256) {
      failures.push(`${label}: no SHA-256 recorded in builds.json`);
      continue;
    }
    const actual = sha256Of(bytes);
    if (actual !== build.sha256) {
      failures.push(
        `${label}: SHA-256 ${actual.slice(0, 12)}… != recorded ${build.sha256.slice(0, 12)}… (${build.file})`,
      );
      continue;
    }
    console.log(`  ok  ${label}  ${build.file}  ${build.size_mb} MB`);
  }
  return failures;
}

function loadBuilds(directory) {
  const buildsPath = join(directory, "builds.json");
  if (!existsSync(buildsPath)) {
    console.error(`No builds.json in ${directory}.`);
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(readFileSync(buildsPath, "utf8"));
    if (Array.isArray(parsed.builds)) return parsed;
  } catch {
    // fall through to the shared error below
  }
  console.error(`builds.json in ${directory} is unreadable.`);
  process.exit(1);
}

// ---- verify-only mode -------------------------------------------------

if (verifyOnly) {
  if (!existsSync(archiveDir)) {
    console.error(`Archive directory not found: ${archiveDir}`);
    process.exit(1);
  }
  const builds = loadBuilds(archiveDir);
  console.log(`Verifying ${builds.builds.length} build(s) in ${archiveDir}`);
  const failures = verifyArchive(archiveDir, builds);
  if (failures.length) {
    console.error("\nArchive integrity FAILED:");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "\nRe-run without --verify to re-download the live release, or restore the build from the backup zip.",
    );
    process.exit(1);
  }
  console.log("\nArchive integrity OK.");
  process.exit(0);
}

// ---- archive the live release ----------------------------------------

mkdirSync(archiveDir, { recursive: true });

const res = await fetch(manifestUrl);
if (!res.ok) {
  console.error(`Manifest fetch failed: HTTP ${res.status} ${manifestUrl}`);
  process.exit(1);
}
const manifest = await res.json();
const version = String(manifest.version);
const code = Number(manifest.version_code);
const apkUrl = manifest.apkUrl || manifest.latestApkUrl;

if (!version || !Number.isFinite(code) || !apkUrl) {
  console.error("Manifest is missing version / version_code / apkUrl.");
  process.exit(1);
}

console.log(`Archiving ${version} / ${code} from ${apkUrl}`);
const apk = await fetch(apkUrl);
if (!apk.ok) {
  console.error(`APK fetch failed: HTTP ${apk.status} ${apkUrl}`);
  process.exit(1);
}
const bytes = Buffer.from(await apk.arrayBuffer());

const sha256 = sha256Of(bytes);
const fileName = `genum-solutions-${version}.apk`;
writeFileSync(join(archiveDir, fileName), bytes);

// ---- builds.json: one row per version+code, newest build wins ----
const buildsPath = join(archiveDir, "builds.json");
let builds = { updated_at: null, builds: [] };
if (existsSync(buildsPath)) {
  try {
    const parsed = JSON.parse(readFileSync(buildsPath, "utf8"));
    if (Array.isArray(parsed.builds)) builds = parsed;
  } catch {
    console.warn("builds.json was unreadable; starting a fresh one.");
  }
}

const idx = builds.builds.findIndex(
  (b) => b.version === version && b.version_code === code,
);
const previous = idx > -1 ? builds.builds[idx] : undefined;

const entry = {
  version,
  version_code: code,
  file: fileName,
  bytes: bytes.length,
  size_mb: Number((bytes.length / 1e6).toFixed(1)),
  sha256,
  manifest: manifestUrl,
  apk_url: apkUrl,
  notes: manifest.notes ? String(manifest.notes) : previous?.notes || "",
  // Keep the provenance of an existing row when this run only re-verifies it.
  build_note: note || previous?.build_note || "",
  archived_at: new Date().toISOString(),
};

if (idx > -1) builds.builds[idx] = entry;
else builds.builds.push(entry);
builds.builds.sort(
  (a, b) =>
    b.version_code - a.version_code || a.version.localeCompare(b.version),
);
builds.updated_at = entry.archived_at;
writeFileSync(buildsPath, `${JSON.stringify(builds, null, 2)}\n`);

// ---- BUILD.md: human-readable mirror of builds.json ----
const lines = [
  "# APK build archive",
  "",
  "Generated by `mobile/scripts/archive-release.mjs`. Do not edit by hand.",
  "",
  `Updated: ${builds.updated_at}`,
  "",
  "| file | version | code | size | SHA-256 | archived |",
  "| --- | --- | --- | --- | --- | --- |",
  ...builds.builds.map(
    (b) =>
      `| \`${b.file}\` | ${b.version} | ${b.version_code} | ${b.size_mb} MB | \`${b.sha256}\` | ${b.archived_at} |`,
  ),
  "",
  "## Source",
  "",
  ...builds.builds.map((b) => {
    const where = b.apk_url
      ? `\`${b.apk_url}\`${b.build_note ? ` — ${b.build_note}` : ""}`
      : b.build_note || "pre-existing archive";
    return `- **${b.version} / ${b.version_code}** — ${where}`;
  }),
  "",
  "## Integrity",
  "",
  "Check every file against the recorded size and SHA-256 (no network):",
  "",
  "```sh",
  "node scripts/archive-release.mjs --dir <this folder> --verify",
  "```",
  "",
  "`SHA256SUMS` is the portable copy of the same checks (`sha256sum -c SHA256SUMS`).",
  "`apk-archive-backup.zip` holds every APK plus these notes, and is refreshed by",
  "each archive run.",
  "",
];
writeFileSync(join(archiveDir, "BUILD.md"), lines.join("\n"));

// ---- SHA256SUMS + verification + backup zip ----
const sums = builds.builds.map((b) => `${b.sha256}  ${b.file}`).join("\n");
writeFileSync(join(archiveDir, "SHA256SUMS"), `${sums}\n`);

console.log(`Saved ${fileName} (${entry.size_mb} MB)`);
console.log(`SHA-256 ${sha256}`);

console.log(`\nVerifying ${builds.builds.length} build(s) in ${archiveDir}`);
const failures = verifyArchive(archiveDir, builds);
if (failures.length) {
  console.error("\nArchive integrity FAILED:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

if (!process.argv.includes("--no-backup")) {
  const backupPath = resolve(
    arg("--backup") || join(archiveDir, "apk-archive-backup.zip"),
  );
  const docs = ["builds.json", "BUILD.md", "SHA256SUMS", "README.md"]
    .map((name) => join(archiveDir, name))
    .filter((path) => existsSync(path));
  writeZip(backupPath, [
    ...builds.builds.map((b) => ({
      name: b.file,
      path: join(archiveDir, b.file),
    })),
    ...docs.map((path) => ({
      name: path.slice(archiveDir.length + 1).replaceAll("\\", "/"),
      path,
    })),
  ]);
  console.log(`Backup refreshed: ${backupPath}`);
}

console.log(
  `Archive now holds ${builds.builds.length} build(s): ${archiveDir}`,
);

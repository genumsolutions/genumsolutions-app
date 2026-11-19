// =====================================================================
// check-release-notes.mjs — the version being shipped must have notes.
//
// Why: upload-release.mjs falls back to one generic sentence when
// release-notes.json has no entry for the version. That fallback is right for
// an emergency re-upload, but it means a forgotten notes entry ships silently
// as "Fully native rebuild…" on a release that is not that at all — exactly
// what happened through 3.4.3. A bump is now incomplete until its notes exist.
//
// It also checks the three version fields agree. They are bumped together by
// scripts/bump-version.mjs, and a half-bump (app.json moved, site.ts left
// behind) is otherwise only visible as a mismatch in the release manifest.
// =====================================================================
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const appJson = readJson(join(rootDir, "app.json"));
const version = appJson?.expo?.version;
const versionCode = appJson?.expo?.android?.versionCode;
if (!version) {
  console.error("check-release-notes: app.json has no expo.version.");
  process.exit(1);
}

// 1) site.ts must show the same version (menu -> "App v…").
const siteTs = readFileSync(join(rootDir, "src/config/site.ts"), "utf8");
const appVersion = siteTs.match(
  /export const APP_VERSION = ["']([^"']+)["']/,
)?.[1];
if (appVersion !== version) {
  errors.push(
    `src/config/site.ts APP_VERSION is ${appVersion ?? "<missing>"} but app.json is ${version}`,
  );
}

// 2) package.json carries the same version (the release manifest reads it).
const pkgVersion = readJson(join(rootDir, "package.json"))?.version;
if (pkgVersion !== version) {
  errors.push(
    `package.json version is ${pkgVersion ?? "<missing>"} but app.json is ${version}`,
  );
}

// 3) versionCode must move forward for a new notes entry to be meaningful.
if (!Number.isInteger(versionCode) || versionCode < 1) {
  errors.push(
    `app.json has no integer android.versionCode (got: ${String(versionCode)})`,
  );
}

// 4) The shipped version needs real notes, not the generic fallback.
const notesPath = join(rootDir, "release-notes.json");
let notes = null;
if (!existsSync(notesPath)) {
  errors.push(
    "mobile/release-notes.json is missing — the uploader would ship the generic sentence",
  );
} else {
  try {
    notes = readJson(notesPath);
  } catch (err) {
    errors.push(`mobile/release-notes.json is not valid JSON (${err.message})`);
  }
}

let bullets = [];
if (notes && typeof notes === "object") {
  const entry = notes[version];
  if (!Array.isArray(entry) || entry.length === 0) {
    errors.push(
      `release-notes.json has no entry for ${version} — add its bullets`,
    );
  } else {
    const blank = entry.findIndex(
      (line) => typeof line !== "string" || !line.trim(),
    );
    if (blank >= 0) {
      errors.push(
        `release-notes.json entry ${version}[${blank}] is empty or not a string`,
      );
    }
    bullets = entry;
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error("\ncheck-release-notes: FAILED");
  process.exit(1);
}

console.log(
  `check-release-notes: ${version} (${versionCode}) has ${bullets.length} note bullet(s); site.ts and package.json agree.`,
);

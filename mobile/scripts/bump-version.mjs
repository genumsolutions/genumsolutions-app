// =====================================================================
// bump-version.mjs - bump the app version from ONE source of truth and
// re-derive every derived metadata copy so nothing is hand-edited.
//
//   app.json                SINGLE SOURCE OF TRUTH (version + versionCode)
//   src/config/site.ts      APP_VERSION (display string)
//   package.json            "version"
//   package-lock.json       "version" (root + package entry)
//   <website>/lib/company.ts  androidApp.version / versionCode / apkUrl
//
// Usage:
//   node scripts/bump-version.mjs <version> <versionCode>
//   node scripts/bump-version.mjs 1.5.12 20
//   node scripts/bump-version.mjs --website <path> 1.5.12 20
//
// The version/versionCode are written to app.json first, then every derived
// value is regenerated from them (apkUrl is derived from the version). The
// website path defaults to the sibling repo on disk and can be overridden.
// =====================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // mobile/
const appRepoDir = resolve(rootDir, '..'); // genumsolutions-app/

// ── Parse args ───────────────────────────────────────────────────────
let websiteDir = resolve(appRepoDir, '../genumsolutions-website');
const positionals = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--website' && argv[i + 1]) {
    websiteDir = resolve(process.cwd(), argv[i + 1]);
    i++;
  } else {
    positionals.push(argv[i]);
  }
}
if (positionals.length < 2) {
  console.error('Usage: node scripts/bump-version.mjs <version> <versionCode>');
  console.error('       node scripts/bump-version.mjs --website <path> 1.5.x <code>');
  process.exit(1);
}
const VERSION = positionals[0];
const VERSION_CODE = String(parseInt(positionals[1], 10));
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error(`Invalid version '${VERSION}' - expected semver like 1.5.12`);
  process.exit(1);
}
if (!/^\d+$/.test(VERSION_CODE)) {
  console.error(`Invalid versionCode '${VERSION_CODE}' - expected an integer`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function editFile(p, fn) {
  if (!existsSync(p)) throw new Error(`File not found: ${p}`);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(p, after, 'utf8');
  return after !== before;
}

let changed = false;

// 1) app.json (source of truth) - targeted replace to preserve file formatting
const appJsonPath = resolve(rootDir, 'app.json');
changed =
  editFile(appJsonPath, (src) =>
    src
      .replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${VERSION}"`)
      .replace(/"versionCode": \d+/, `"versionCode": ${VERSION_CODE}`),
  ) || changed;
console.log(`  app.json            -> ${VERSION} (${VERSION_CODE})`);
if (!existsSync(appJsonPath)) throw new Error(`File not found: ${appJsonPath}`);

// 2) src/config/site.ts -> APP_VERSION
changed =
  editFile(resolve(rootDir, 'src/config/site.ts'), (src) =>
    src.replace(/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${VERSION}';`),
  ) || changed;

// 3) package.json + package-lock.json version
changed = editFile(resolve(rootDir, 'package.json'), (src) =>
  src.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${VERSION}"`),
) || changed;
const lockPath = resolve(rootDir, 'package-lock.json');
const lock = readJson(lockPath);
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
writeJson(lockPath, lock);
changed = true;

// 4) website lib/company.ts -> androidApp
const companyPath = resolve(websiteDir, 'lib/company.ts');
const apkUrl = `https://bkylfnlybtsujwzropru.supabase.co/storage/v1/object/public/app-releases/genum-solutions-${VERSION}.apk`;
changed =
  editFile(companyPath, (src) =>
    src
      .replace(/version: '\d+\.\d+\.\d+',/, `version: '${VERSION}',`)
      .replace(/versionCode: \d+,/, `versionCode: ${VERSION_CODE},`)
      .replace(/genum-solutions-\d+\.\d+\.\d+\.apk/, `genum-solutions-${VERSION}.apk`),
  ) || changed;
console.log(`  website company.ts  -> ${VERSION} (${VERSION_CODE})`);

console.log('Version bumped. Commit + push app (and website) repos with:');
console.log('  git add -A && git commit -m "chore: bump app version to ..." && git push origin main');

// =====================================================================
// bump-runtime-version.mjs - bump the runtimeVersion in app.json only.
//
// Used before OTA-only pushes to force devices to check for new bundles.
// Does NOT change app version or versionCode.
//
// Usage:
//   node scripts/bump-runtime-version.mjs 1.0.1
//   node scripts/bump-runtime-version.mjs --increment
//
// The --increment flag bumps the patch version automatically.
// =====================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // mobile/
const appJsonPath = resolve(rootDir, 'app.json');

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }

if (!existsSync(appJsonPath)) throw new Error(`File not found: ${appJsonPath}`);

const app = readJson(appJsonPath);
const current = app.expo.runtimeVersion;

let next;
const argv = process.argv.slice(2);
if (argv.includes('--increment')) {
  const parts = current.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  next = parts.join('.');
} else if (argv.length >= 1 && /^\d+\.\d+\.\d+$/.test(argv[0])) {
  next = argv[0];
} else {
  console.error('Usage: node scripts/bump-runtime-version.mjs <runtimeVersion>');
  console.error('       node scripts/bump-runtime-version.mjs --increment');
  console.error(`  Current runtimeVersion: ${current}`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid runtimeVersion '${next}' - expected semver like 1.0.0`);
  process.exit(1);
}

app.expo.runtimeVersion = next;
writeJson(appJsonPath, app);
console.log(`runtimeVersion bumped: ${current} -> ${next}`);
console.log('Push to main to trigger OTA-only workflow.');

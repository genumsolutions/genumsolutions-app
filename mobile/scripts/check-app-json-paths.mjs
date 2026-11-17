#!/usr/bin/env node
// =====================================================================
// check-app-json-paths.mjs — fail fast when app.json names a font file
// that is not on disk.
//
// Why this exists: the release build died twice in `expo prebuild` on font
// paths — once from a nested `fontDefinitions` block (expo-font called
// path.parse(undefined)) and once from a Sora 900 weight the package never
// shipped. Both only surfaced when the android/ cache missed, so the cost was
// a full Gradle run per discovery. This check takes milliseconds.
//
// Usage: node scripts/check-app-json-paths.mjs [path/to/app.json]
// =====================================================================
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const appJsonPath = resolve(projectRoot, process.argv[2] ?? "app.json");

let config;
try {
  config = JSON.parse(readFileSync(appJsonPath, "utf8"));
} catch (error) {
  console.error(`✖ Could not read ${appJsonPath}: ${error.message}`);
  process.exit(1);
}

const plugins = config?.expo?.plugins ?? [];

/** The expo-font plugin accepts both "expo-font" and ["expo-font", props]. */
function expoFontProps(entry) {
  if (entry === "expo-font") return {};
  if (Array.isArray(entry) && entry[0] === "expo-font") return entry[1] ?? {};
  return null;
}

/** Every `path` string anywhere in a plugin's props, plus bare string entries. */
function collectPaths(value, found = []) {
  if (typeof value === "string") {
    // Bare strings in the iOS list are file paths; ignore anything that is
    // clearly a setting (no separator, no extension).
    if (value.includes("/") && /\.[a-z0-9]+$/i.test(value)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "path" && typeof child === "string") found.push(child);
      else collectPaths(child, found);
    }
  }
  return found;
}

const declared = [];
for (const entry of plugins) {
  const props = expoFontProps(entry);
  if (!props) continue;
  for (const path of collectPaths(props)) declared.push(path);
}

const missing = declared.filter((path) => !existsSync(resolve(projectRoot, path)));

if (missing.length > 0) {
  console.error(`✖ app.json references ${missing.length} file(s) that do not exist:`);
  for (const path of missing) console.error(`   ${path}`);
  console.error(
    "\nFix the path or remove the entry. A wrong font path breaks `expo prebuild`,\n" +
      "which only fails when the android/ cache misses — i.e. on a release run.",
  );
  process.exit(1);
}

console.log(`✔ Every app.json asset path exists (${declared.length} checked).`);

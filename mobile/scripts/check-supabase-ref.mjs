// =====================================================================
// check-supabase-ref.mjs — "is the config we are about to BAKE IN pointing at
// the live Supabase project?"
//
// Why this exists: EXPO_PUBLIC_* values are inlined into the JS bundle by Metro
// at build time, so an APK or an OTA bundle is permanently bound to whatever
// project URL / anon key were present at build time. When the project moved on
// 2026-11-07 the repo was repointed but the GitHub Actions secrets are set
// outside the repo — a stale secret therefore produces a green build whose app
// talks to a project that no longer resolves. Nothing else in CI could see it
// (the build succeeds; the crash happens on a phone).
//
// The expected project is NOT hardcoded here: it is read from
// src/config/update.ts, which already pins the shared `app-releases` bucket URL
// (the same ref the APK is downloaded from). One source of truth, so moving
// project means changing that file and nothing else.
//
// Checks (refs only — never prints a key):
//   1. EXPO_PUBLIC_SUPABASE_URL (else SUPABASE_URL) host === expected ref
//   2. the anon key's JWT `ref` claim === expected ref, and it is not expired
//   3. the service-role key's `ref` claim, when supplied, === expected ref
//
// Usage:
//   node scripts/check-supabase-ref.mjs             # CI (env vars)
//   node scripts/check-supabase-ref.mjs --require   # fail if the env is absent
// =====================================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPDATE_CONFIG = resolve(rootDir, "src/config/update.ts");

/** The project ref the app's own release URLs point at. */
export function expectedRef(configPath = UPDATE_CONFIG) {
  const src = readFileSync(configPath, "utf8");
  const m = src.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? m[1] : null;
}

/** Project ref carried in a Supabase URL's hostname. */
export function refFromUrl(url) {
  try {
    const host = new URL(String(url).trim()).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Decode a Supabase key's JWT payload (no signature check — this is a config shape check). */
export function claimsFromKey(key) {
  const parts = String(key || "")
    .trim()
    .split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/** Read a key from the process env, else mobile/.env.local (local runs). */
export function readEnv(name, envFile = resolve(rootDir, ".env.local")) {
  const fromProcess = String(process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  if (!existsSync(envFile)) return "";
  for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    if (line.slice(0, idx).trim() === name) return line.slice(idx + 1).trim();
  }
  return "";
}

/**
 * Pure check: returns a list of human-readable problems ([] = all good).
 * `env` is a plain object of the values to validate.
 */
export function checkEnv(env, expected) {
  const problems = [];
  const want = expected;
  if (!want) {
    problems.push(
      "could not read the expected project ref from src/config/update.ts (no *.supabase.co URL found)",
    );
    return problems;
  }

  const url = String(
    env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "",
  ).trim();
  if (!url) {
    problems.push(
      "EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is not set — the bundle would ship with an EMPTY Supabase URL",
    );
  } else {
    const got = refFromUrl(url);
    if (got !== want) {
      problems.push(
        `Supabase URL points at project "${got ?? url}" but the app's release URLs are on "${want}"`,
      );
    }
  }

  const anonKey = String(env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!anonKey) {
    problems.push(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY is not set — sign-in and every table read would fail",
    );
  } else {
    const claims = claimsFromKey(anonKey);
    if (!claims) {
      problems.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is not a readable JWT");
    } else {
      if (claims.ref !== want) {
        problems.push(
          `anon key belongs to project "${claims.ref ?? "unknown"}" but the app is on "${want}"`,
        );
      }
      if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
        problems.push(
          "anon key is expired — generate the current one in Project Settings → API",
        );
      }
    }
  }

  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (serviceKey) {
    const claims = claimsFromKey(serviceKey);
    if (!claims || claims.ref !== want) {
      problems.push(
        `SUPABASE_SERVICE_ROLE_KEY belongs to project "${claims?.ref ?? "unknown"}" but the app is on "${want}"`,
      );
    }
  }

  return problems;
}

function main() {
  const requireEnv = process.argv.includes("--require");
  const expected = expectedRef();
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: readEnv("EXPO_PUBLIC_SUPABASE_URL"),
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };

  const hasAny = Object.values(env).some(Boolean);
  if (!hasAny && !requireEnv) {
    console.log(
      "Supabase project check: no Supabase config in the environment — nothing baked in, nothing to verify.",
    );
    return;
  }

  const problems = checkEnv(env, expected);
  if (problems.length) {
    console.error(
      `\n❌ Supabase project check FAILED — the bundle would not reach the live project "${expected ?? "?"}":`,
    );
    for (const p of problems) console.error(`   • ${p}`);
    console.error(
      "\nFix the GitHub Actions secrets (Settings → Secrets and variables → Actions):\n" +
        "   SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY\n" +
        "They must belong to the same project the app's release URLs use\n" +
        "(see mobile/src/config/update.ts).\n",
    );
    process.exit(1);
  }

  console.log(
    `✅ Supabase project check: URL + keys all point at "${expected}".`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}

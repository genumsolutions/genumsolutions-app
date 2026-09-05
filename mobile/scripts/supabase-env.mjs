// =====================================================================
// Shared Supabase env loader for the release scripts.
//
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the process env
// (GitHub Actions secrets) OR mobile/.env.local, TRIMS both values, and
// validates that the URL actually parses.
//
// Why: a classic CI failure is a secret pasted from the Supabase dashboard
// with a trailing newline/space - fetch() then dies with
//   "Failed to parse URL from https://xxxx.supabase.co /storage/v1/bucket"
// (the secret shows as *** in the log). Trimming + parsing makes the scripts
// immune to that copy-paste quirk.
//
// Returns { baseUrl, serviceRoleKey, urlError }.
//   baseUrl       normalized origin of the URL (no trailing slash)
//   serviceRoleKey trimmed service-role key (may be '')
//   urlError      non-null when SUPABASE_URL is set but not a valid URL
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadSupabaseEnv() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  // Minimal .env.local parsing (matching the project's existing scripts).
  const env = {};
  const envFile = resolve(rootDir, '.env.local');
  if (existsSync(envFile)) {
    for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  const url = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  let baseUrl = url.replace(/\/+$/, '');
  let urlError = null;
  if (url) {
    try {
      baseUrl = new URL(url).origin;
    } catch {
      urlError =
        `SUPABASE_URL is not a valid URL${url ? `: "${url}"` : ''} — ` +
        `check the value for leading/trailing spaces or newlines in the Actions secret / .env.local.`;
    }
  }

  return { baseUrl, serviceRoleKey, urlError };
}
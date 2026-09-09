// =====================================================================
// sync-ota-manifest.mjs — Publish "short update" metadata for an OTA push.
//
// OTA bundles (JS/asset only) keep the SAME app version — no APK is built —
// so upload-release.mjs / sync-version.mjs must NOT run here (they would
// advertise a version or null out the size). This script instead reads the
// LIVE release.json, preserves every field (version, version_code, size,
// apk/latest/release URLs…), and updates ONLY the human-facing metadata:
//   - notes       the "what changed" line the website /app and in-app
//                 updater show (prefixed with "OTA ·")
//   - updated_at  now (so the website and app show the site/app updated)
//
// It is invoked by .github/workflows/ota-only.yml right after the eas
// publish, so each short update is automatically reflected on the website
// download page and in the app's update card — no manual website work.
//
// Usage:
//   node scripts/sync-ota-manifest.mjs --message "Remote joystick remaster"
//   node scripts/sync-ota-manifest.mjs --message "..." --dry-run
//
// Env vars (or mobile/.env.local):
//   SUPABASE_URL              e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY Supabase -> Settings -> API (service_role)
// =====================================================================
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSupabaseEnv } from './supabase-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUCKET = 'app-releases';
const MANIFEST_FILE = 'release.json';

function parseArgs(argv) {
  const args = { message: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--message' && argv[i + 1]) args.message = argv[i + 1];
    if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const { message, dryRun } = parseArgs(process.argv);
  const { baseUrl: url, serviceRoleKey: serviceKey, urlError } = loadSupabaseEnv();
  if (urlError) throw new Error(urlError);
  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them as env vars or in mobile/.env.local.',
    );
  }

  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${MANIFEST_FILE}`;
  const adminUrl = `${url}/storage/v1/object/${BUCKET}/${MANIFEST_FILE}`;

  // Read the CURRENT manifest (authoritative — never invent version/size).
  const res = await fetch(`${publicUrl}?_t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not read current release.json (${res.status}).`);
  }
  const current = await res.json();
  if (!current || typeof current.version !== 'string') {
    throw new Error('Current release.json is missing a version field.');
  }

  const note = message ? `OTA · ${message}` : 'OTA short update published.';
  const next = {
    ...current,
    notes: note,
    updated_at: new Date().toISOString(),
  };

  console.log('─'.repeat(56));
  console.log(`  OTA manifest metadata sync`);
  console.log(`  Version (unchanged): ${next.version}`);
  console.log(`  notes:               ${next.notes}`);
  console.log(`  updated_at:          ${next.updated_at}`);
  console.log('─'.repeat(56));

  if (dryRun) {
    console.log('\n(DRY RUN) Manifest NOT uploaded. Would publish:\n');
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  const upload = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'cache-control': '0', // No cache — website must always get fresh
    },
    body: JSON.stringify(next, null, 2),
  });
  if (!upload.ok) {
    const text = await upload.text().catch(() => '');
    throw new Error(`Manifest metadata upload failed: ${upload.status} ${text}`);
  }

  console.log(`\n✅ Metadata published — website /app and in-app updater now show:\n   "${next.notes}" (updated ${next.updated_at}).`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
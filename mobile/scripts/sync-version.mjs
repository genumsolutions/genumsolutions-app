// =====================================================================
// sync-version.mjs — Upload ONLY the release.json manifest to Supabase.
//
// This is the lightweight "version sync" step: it reads the version from
// app.json (the single source of truth) and pushes the manifest to the
// public Supabase bucket. No APK upload — use upload-release.mjs for that.
//
// The website (AppBanner + /app page) fetches this manifest on mount to
// display the current version. The native app also checks it for updates.
//
// Usage:
//   node scripts/sync-version.mjs              (reads from app.json)
//   node scripts/sync-version.mjs --dry-run    (print manifest, don't upload)
//
// Env vars (or mobile/.env.local):
//   SUPABASE_URL              e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY Supabase -> Settings -> API (service_role)
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Read version from app.json (single source of truth) ─────────────
const appJson = JSON.parse(readFileSync(resolve(rootDir, 'app.json'), 'utf8'));
const expo = appJson.expo;
const VERSION = expo.version;
const VERSION_CODE = expo.android?.versionCode;
if (!VERSION || !VERSION_CODE) {
  console.error('Error: Could not read version/versionCode from app.json');
  process.exit(1);
}

// ── Supabase config ─────────────────────────────────────────────────
const BUCKET = 'app-releases';
const APK_FILE = 'genum-solutions-latest.apk';
const MANIFEST_FILE = 'release.json';

function loadEnv() {
  const envFile = resolve(rootDir, '.env.local');
  if (!existsSync(envFile)) return {};
  const out = {};
  for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function parseArgs(argv) {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') return { dryRun: true };
  }
  return { dryRun: false };
}

async function ensureBucket(url, key) {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.ok) {
    const buckets = await res.json();
    if (buckets.some((b) => b.name === BUCKET)) return;
  }
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: BUCKET, public: true }),
  });
  if (!create.ok && create.status !== 400) {
    const text = await create.text().catch(() => '');
    throw new Error(`Failed to create bucket "${BUCKET}": ${create.status} ${text}`);
  }
}

async function main() {
  const env = loadEnv();
  const { dryRun } = parseArgs(process.argv);
  const url = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  const publicApkUrl = `${url}/storage/v1/object/public/${BUCKET}/${APK_FILE}`;
  const publicManifestUrl = `${url}/storage/v1/object/public/${BUCKET}/${MANIFEST_FILE}`;

  const manifest = {
    version: VERSION,
    version_code: VERSION_CODE,
    apkUrl: publicApkUrl,
    size_mb: null,   // Will be filled by upload-release.mjs after APK upload
    sizeLabel: null,  // Will be filled by upload-release.mjs after APK upload
    releaseUrl: publicManifestUrl,
    appsPagePath: '/app',
    notes: `Released from app.json (version ${VERSION}, versionCode ${VERSION_CODE}).`,
    updated_at: new Date().toISOString(),
  };

  console.log('─'.repeat(56));
  console.log(`  Syncing version from app.json`);
  console.log(`  Version:     ${manifest.version}`);
  console.log(`  VersionCode: ${manifest.version_code}`);
  console.log(`  Manifest:    ${publicManifestUrl}`);
  console.log('─'.repeat(56));

  if (dryRun) {
    console.log('\nManifest content (dry run — not uploaded):\n');
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (!url || !serviceKey) {
    console.error('\nError: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Set them as env vars or in mobile/.env.local');
    process.exit(1);
  }

  await ensureBucket(url, serviceKey);

  const body = JSON.stringify(manifest, null, 2);
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${MANIFEST_FILE}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'cache-control': '0',  // No cache — website must always get fresh
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Manifest upload failed: ${res.status} ${text}`);
  }

  console.log(`\n✅ Manifest uploaded! Website and app will now show v${VERSION}`);
  console.log(`   URL: ${publicManifestUrl}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

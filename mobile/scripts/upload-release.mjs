// =====================================================================
// Uploads the built Android release APK to the shared Supabase project
// into a public "app-releases" bucket and prints the public download URL.
//
// Self-contained: uses Node's built-in fetch (Node >= 18) and the Supabase
// Storage REST API, so it has no runtime dependency on @supabase/supabase-js.
//
// Secrets come from environment variables (or a local .env.local file):
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase -> Project Settings -> API
//                                (service_role, NEVER commit this key)
//
// Usage:
//   node scripts/upload-release.mjs                       (default APK path)
//   node scripts/upload-release.mjs --apk <path>          (custom APK path)
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSupabaseEnv } from './supabase-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Read version from app.json (single source of truth) ────────────
const appJson = JSON.parse(readFileSync(resolve(rootDir, 'app.json'), 'utf8'));
const expo = appJson.expo;
const VERSION = expo.version;
const VERSION_CODE = expo.android?.versionCode;
if (!VERSION || !VERSION_CODE) {
  console.error('Error: Could not read version/versionCode from app.json');
  process.exit(1);
}
const defaultApk = resolve(
  rootDir,
  'releases',
  `genum-solutions-${VERSION}-arm64-v8a.apk`,
);

const BUCKET = 'app-releases';
const LATEST_FILE = 'genum-solutions-latest.apk';
const VERSIONED_FILE = `genum-solutions-${VERSION}.apk`;
const MANIFEST_NAME = 'release.json';
const CONTENT_TYPE = 'application/vnd.android.package-archive';

function parseArgs(argv) {
  const args = { apk: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apk' && argv[i + 1]) args.apk = argv[i + 1];
  }
  return args;
}

async function ensureBucket(url, key) {
  const list = await fetch(`${url}/storage/v1/bucket`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (list.ok) {
    const buckets = await list.json();
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
  if (!create.ok) {
    // 400 usually means the bucket already exists (race) - that's fine.
    const text = await create.text().catch(() => '');
    if (create.status !== 400) {
      throw new Error(`Failed to create bucket "${BUCKET}": ${create.status} ${text}`);
    }
  } else {
    console.log(`Created public bucket "${BUCKET}".`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { baseUrl: url, serviceRoleKey: serviceKey, urlError } = loadSupabaseEnv();
  if (urlError) throw new Error(urlError);
  const apkPath = args.apk ? resolve(rootDir, args.apk) : defaultApk;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them as env vars or in mobile/.env.local.',
    );
  }
  if (!existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

  await ensureBucket(url, serviceKey);

  const body = readFileSync(apkPath);
  const actualSizeMb = +(body.length / 1024 / 1024).toFixed(1);
  // Upload as both versioned and latest filenames
  for (const fileName of [VERSIONED_FILE, LATEST_FILE]) {
    console.log(`Uploading ${apkPath} (${actualSizeMb} MB) to ${BUCKET}/${fileName} ...`);
    const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': CONTENT_TYPE,
        'x-upsert': 'true',
        'cache-control': '3600',
      },
      body,
    });
    if (!upload.ok) {
      const text = await upload.text().catch(() => '');
      throw new Error(`Upload failed for ${fileName}: ${upload.status} ${text}`);
    }
  }

  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${LATEST_FILE}`;
  const versionedUrl = `${url}/storage/v1/object/public/${BUCKET}/${VERSIONED_FILE}`;
  console.log('Uploaded. Public download URLs:');
  console.log('  Latest:', publicUrl);
  console.log('  Versioned:', versionedUrl);

  // Publish the release manifest the native app checks for updates against.
  const manifest = JSON.stringify(
    {
      version: VERSION,
      version_code: VERSION_CODE,
      apkUrl: versionedUrl,
      latestApkUrl: publicUrl,
      size_mb: actualSizeMb,
      sizeLabel: `${actualSizeMb} MB`,
      releaseUrl: `${url}/storage/v1/object/public/${BUCKET}/${MANIFEST_NAME}`,
      appsPagePath: '/app',
      notes: 'Fully native rebuild: native UI, native auth, shared Supabase data, in-app updates.',
      updated_at: new Date().toISOString(),
    },
    null,
    2,
  );
  const manifestUpload = await fetch(`${url}/storage/v1/object/${BUCKET}/${MANIFEST_NAME}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      'cache-control': '0',  // No cache — website must always get fresh
    },
    body: manifest,
  });
  if (!manifestUpload.ok) {
    const text = await manifestUpload.text().catch(() => '');
    throw new Error(`Manifest upload failed: ${manifestUpload.status} ${text}`);
  }
  console.log(`Released v${VERSION}. Manifest: ${url}/storage/v1/object/public/${BUCKET}/${MANIFEST_NAME}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

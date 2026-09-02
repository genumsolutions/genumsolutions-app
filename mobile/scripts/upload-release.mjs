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

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Current release. Update on every publish (keep in sync with app.json
// version / src/config/site.ts / src/config/update.ts).
const VERSION = '1.5.3';
const APK_SIZE_MB = '32.5 MB';

const defaultApk = resolve(
  rootDir,
  'releases',
  `genum-solutions-${VERSION}-arm64-v8a.apk`,
);

const BUCKET = 'app-releases';
const FILE_NAME = 'genum-solutions-latest.apk';
const MANIFEST_NAME = 'release.json';
const CONTENT_TYPE = 'application/vnd.android.package-archive';

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
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const url = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const apkPath = args.apk ? resolve(rootDir, args.apk) : defaultApk;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them as env vars or in mobile/.env.local.',
    );
  }
  if (!existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

  await ensureBucket(url, serviceKey);

  const body = readFileSync(apkPath);
  console.log(`Uploading ${apkPath} (${(body.length / 1024 / 1024).toFixed(1)} MB) to ${BUCKET}/${FILE_NAME} ...`);

  const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${FILE_NAME}`, {
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
    throw new Error(`Upload failed: ${upload.status} ${text}`);
  }

  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${FILE_NAME}`;
  console.log('Uploaded. Public download URL:');
  console.log(publicUrl);

  // Publish the release manifest the native app checks for updates against.
  const manifest = JSON.stringify(
    {
      version: VERSION,
      apkUrl: publicUrl,
      size: APK_SIZE_MB,
      notes: 'Fully native rebuild: native UI, native auth, shared Supabase data, in-app updates.',
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
      'cache-control': '300',
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

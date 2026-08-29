// =====================================================================
// Uploads the built Android release APK to the shared Supabase project
// into a public "app-releases" bucket and prints the public download URL.
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
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultApk = resolve(
  rootDir,
  'releases',
  'genum-solutions-1.0.0-arm64-v8a.apk',
);

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

async function main() {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const apkPath = args.apk ? resolve(rootDir, args.apk) : defaultApk;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them as env vars or in mobile/.env.local.',
    );
  }
  if (!existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const bucket = 'app-releases';
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets && !buckets.some((b) => b.name === bucket)) {
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
    });
    if (createErr) throw new Error(`Failed to create bucket: ${createErr.message}`);
    console.log(`Created public bucket "${bucket}".`);
  }

  const fileName = 'genum-solutions-latest.apk';
  const body = readFileSync(apkPath);
  console.log(`Uploading ${apkPath} (${(body.length / 1024 / 1024).toFixed(1)} MB) to ${bucket}/${fileName} ...`);
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(fileName, body, {
      upsert: true,
      contentType: 'application/vnd.android.package-archive',
      cacheControl: '3600',
    });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
  console.log('Uploaded. Public download URL:');
  console.log(publicUrl);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
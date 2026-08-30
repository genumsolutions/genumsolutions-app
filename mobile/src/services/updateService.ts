// =====================================================================
// updateService - native in-app "check for update" with guided install.
//
// Because the app is a signed APK (no app store), an update means:
//   1. fetch release.json (the latest published version + APK url)
//   2. compare it with the running APP_VERSION
//   3. download the new APK to cache, then launch the Android package
//      installer via a content:// URI (the user taps INSTALL — Android
//      always requires the final confirmation, there is no silent install).
// =====================================================================
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { APP_VERSION } from '../config/site';
import {
  APK_URL,
  RELEASE_MANIFEST_URL,
  type ReleaseManifest,
} from '../config/update';

export type UpdateStatus =
  | 'unknown'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'error'
  | 'downloading'
  | 'downloaded'
  | 'installing';

export type UpdateState = {
  status: UpdateStatus;
  latestVersion?: string;
  apkUrl?: string;
  size?: string;
  notes?: string;
  error?: string;
};

// Compare dotted numeric versions (e.g. "1.10.0" vs "1.9.3").
// Returns -1 when `current < latest`, 0 when equal, 1 when `current > latest`.
export function compareVersions(current: string, latest: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .split('.')
      .map((part) => parseInt(part.replace(/\D/g, ''), 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function isVersionNewer(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0;
}

// Fetch the latest published release info. Pure-ish: accepts an injected
// fetch so it can be unit tested offline.
export async function checkForUpdate(
  fetchImpl: typeof fetch = fetch,
  manifestUrl: string = RELEASE_MANIFEST_URL,
): Promise<UpdateState> {
  try {
    const res = await fetchImpl(manifestUrl, { cache: 'no-store' });
    if (!res.ok) {
      return { status: 'error', error: `Release check failed (${res.status}).` };
    }
    const data = (await res.json()) as ReleaseManifest;
    const latest = (data.version || '').trim();
    if (!latest) {
      return { status: 'error', error: 'Release manifest is missing a version.' };
    }
    const apkUrl = data.apkUrl || APK_URL;
    if (isVersionNewer(APP_VERSION, latest)) {
      return {
        status: 'update-available',
        latestVersion: latest,
        apkUrl,
        size: data.size,
        notes: data.notes,
      };
    }
    return {
      status: 'up-to-date',
      latestVersion: latest,
      size: data.size,
    };
  } catch {
    return { status: 'error', error: 'Could not reach the update server.' };
  }
}

// Download the release APK and launch the Android installer for it.
// The user taps INSTALL — Android never allows silent installs.
export async function downloadAndInstall(
  apkUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const target = new File(Paths.cache, 'genum-update.apk');

  // Phase 1: download. Report precise, distinct download failures so they
  // can't be mistaken for an install problem.
  let file;
  try {
    file = await File.downloadFileAsync(apkUrl, target, { idempotent: true });
  } catch (e) {
    throw new Error(
      'Download failed. Check your connection or storage, then try again. (download: ' +
        (e instanceof Error ? e.message : String(e)) +
        ')',
    );
  }

  // mirror any native download progress into the callback (best-effort)
  if (onProgress) onProgress(1);

  // Phase 2: launch the Android installer with the downloaded file.
  // REQUEST_INSTALL_PACKAGES (added via the with-install-permission plugin)
  // is required on Android 8+ for this intent to be allowed.
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: file.contentUri,
      type: 'application/vnd.android.package-archive',
      // FLAG_GRANT_READ_URI_PERMISSION so the installer can read our cached file.
      flags: 1,
    });
  } catch (e) {
    throw new Error(
      'Could not open the installer. Enable "Install unknown apps" for GENUM and try again. (install: ' +
        (e instanceof Error ? e.message : String(e)) +
        ')',
    );
  }
}

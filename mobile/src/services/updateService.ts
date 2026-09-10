// =====================================================================
// updateService - native in-app "check for update" with guided install.
//
// The app now supports TWO update channels:
//   1. OTA (Over-The-Air) via expo-updates — for JS/asset changes only.
//      These are silent updates that apply on next app load.
//   2. Full APK download — for native module changes (new permissions,
//      new expo plugins, gradle config). Requires user confirmation.
//
// Update flow:
//   1. Check for OTA update (JS/asset only) — if available, apply silently.
//   2. If no OTA update, check for APK update (native changes).
//   3. Download and guide user through APK install.
// =====================================================================
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
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
  /** Last-published timestamp from release.json ("YYYY-MM-DDTHH:mm:ssZ"). */
  updatedAt?: string;
  error?: string;
  /** true when an OTA (JS/asset) update was found and applied. */
  otaApplied?: boolean;
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

// ── OTA Update Check ──────────────────────────────────────────────
// Checks for expo-updates OTA bundle. Returns true if an OTA update
// was found and applied (will take effect on next app reload).
export async function checkForOtaUpdate(): Promise<{
  applied: boolean;
  error?: string;
}> {
  // OTA only works on native (Android/iOS), not web
  if (Platform.OS === 'web') {
    return { applied: false };
  }
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      return { applied: true };
    }
    return { applied: false };
  } catch (e) {
    // OTA check is best-effort — don't block the app if it fails
    return {
      applied: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── APK Update Check ─────────────────────────────────────────────
// Fetches the latest published release info from Supabase. Pure-ish:
// accepts an injected fetch so it can be unit tested offline.
// Compares BOTH the display version string AND the native versionCode
// (from expo-constants) so that an OTA-injected APP_VERSION can never
// suppress a real APK update.
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
    const size = data.sizeLabel || data.size;

    // Primary check: display version string comparison.
    const versionNewer = isVersionNewer(APP_VERSION, latest);

    // Fallback check: native versionCode (the Android integer). This catches
    // the case where an OTA injects a newer APP_VERSION into the JS bundle
    // but the native build is still the old versionCode — the device
    // self-reports the new version and the version-string check returns false.
    const nativeCode = Constants.expoConfig?.android?.versionCode ?? 0;
    const manifestCode = data.version_code ?? 0;
    const codeNewer = nativeCode > 0 && manifestCode > 0 && nativeCode < manifestCode;

    if (versionNewer || codeNewer) {
      return {
        status: 'update-available',
        latestVersion: latest,
        apkUrl,
        size,
        notes: data.notes,
        updatedAt: data.updated_at,
      };
    }
    return {
      status: 'up-to-date',
      latestVersion: latest,
      size,
      updatedAt: data.updated_at,
    };
  } catch {
    return { status: 'error', error: 'Could not reach the update server.' };
  }
}

// ── Combined Update Check ─────────────────────────────────────────
// Checks OTA AND the APK manifest. These are independent channels, so an
// OTA must never mask a newer APK: an OTA-only push keeps the SAME app
// version (see ota-only.yml) while every release bumps version/versionCode,
// so a large version increment always means "install the new APK".
export async function checkForAnyUpdate(
  fetchImpl: typeof fetch = fetch,
  manifestUrl: string = RELEASE_MANIFEST_URL,
): Promise<UpdateState> {
  // 1. Silent OTA check (JS/asset only — same app version, applied on reload)
  const ota = await checkForOtaUpdate();

  // 2. APK check always runs so a newer native release still surfaces a pill
  //    on the same launch where an OTA bundle happens to be available.
  const apk = await checkForUpdate(fetchImpl, manifestUrl);
  if (apk.status === 'update-available' || apk.status === 'error') {
    return { ...apk, otaApplied: ota.applied };
  }
  if (ota.applied) {
    return {
      status: 'up-to-date',
      notes: 'A UI update was applied. Restart the app to see changes.',
      otaApplied: true,
      updatedAt: apk.updatedAt,
    };
  }
  return apk;
}

// ── APK Download + Install ────────────────────────────────────────
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

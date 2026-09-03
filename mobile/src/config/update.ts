// =====================================================================
// Update config - where the app checks for a newer release and downloads it.
//
// The app is distributed as a signed APK (no app store), so updates are
// "check the manifest, download the APK, hand it to the Android installer".
// Keep the values here in sync with what is published to Supabase storage.
// =====================================================================

export const APK_URL =
  'https://bkylfnlybtsujwzropru.supabase.co/storage/v1/object/public/app-releases/genum-solutions-latest.apk';

// A small JSON manifest next to the APK describing the newest published
// release. Updated by scripts/upload-release.mjs on every publish.
export const RELEASE_MANIFEST_URL =
  'https://bkylfnlybtsujwzropru.supabase.co/storage/v1/object/public/app-releases/release.json';

// Expected shape of release.json (written by scripts/upload-release.mjs):
//   { "version": "1.5.5", "version_code": 13, "apkUrl": "https://...",
//     "latestApkUrl": "https://...", "size_mb": 34.5, "sizeLabel": "34.5 MB",
//     "notes": "...", "updated_at": "..." }
export type ReleaseManifest = {
  version: string;
  version_code?: number;
  apkUrl?: string;
  latestApkUrl?: string;
  size_mb?: number;
  /** Human-readable size, e.g. "34.5 MB" (set by upload-release.mjs). */
  sizeLabel?: string;
  /** Legacy alias some older manifests use for the size label. */
  size?: string;
  notes?: string;
  updated_at?: string;
};

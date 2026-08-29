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

// Expected shape of release.json:
//   { "version": "1.2.0", "apkUrl": "https://...", "size": "23.4 MB", "notes": "..." }
export type ReleaseManifest = {
  version: string;
  apkUrl?: string;
  size?: string;
  notes?: string;
};

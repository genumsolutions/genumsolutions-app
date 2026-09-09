# Expo version

This project uses Expo SDK 54 (see package.json: `expo ~54.0.37`). Read the SDK 54 docs at
https://docs.expo.dev/versions/v54.0.0/ before writing any code. Do NOT follow SDK 57 guidance.

# Architecture

The app is **fully native with its own UI/UX** — it is NOT a WebView mirror of the website. There
is no WebView and no `WEBSITE_URL`. It reads and writes the SAME Supabase database the website uses
(`products`, `services`, `projects` via `products`, `robo_car_modes`, `site_content`, `carts`,
`orders`, `customer_messages`) — see `website/supabase/schema.sql` in the sibling
`genumsolutions-website` repo for the shared schema.

- Navigation: `@react-navigation` bottom tabs (Home / Shop / Cart / Account) + native-stack screens
  (ProductDetail, Checkout, OrderSuccess, Services, Projects, Contact, About, Tools). See
  `src/navigation/RootNavigator.tsx` and `src/navigation/types.ts`.
- State: `src/context/AppContext.tsx` holds auth + cart. Native Supabase auth via
  `src/services/authService.ts` (email/password, Google, reset). Session persisted in SecureStore.
- Data layer: `src/services/` (`productService`, `serviceService`, `cartService`, `orderService`,
  `projectService`) read the shared tables with the anon key (RLS allows public SELECT).
- Styling: NativeWind (`global.css`) + theme tokens in `tailwind.config.js` (mirrors the website's
  navy/ink/gold palette).
- Config: `src/config/` has `site.ts` (`APP_VERSION` only), `company.ts`, `supabase.ts`, `update.ts`
  (APK/manifest URLs for the in-app updater).

# Google OAuth

Google Sign-In is NOT routed through any WebView. The app uses the native Google Sign-In library
(`@react-native-google-signin/google-signin`) with an Android OAuth client whose SHA-1 fingerprint
must match the signing keystore, plus a redirect URL `genumsolutions://auth` registered in Supabase
(Auth -> URL configuration) and the Google provider enabled. Keep these in sync when the release
signing key changes.

# Release

- Keep the app-side version in sync on every release so installs update over-the-top:
  1. `app.json` -> `version` and `android.versionCode` (single source of truth)
  2. `src/config/site.ts` -> `APP_VERSION`
  - The website's bundled fallback (`lib/company.ts` -> `androidApp`) is NOT bumped in advance: the
    `/app` download page reads the LIVE `release.json` manifest (only written by an actual upload),
    so it never advertises a version whose APK isn't ready. After an upload, sync the fallback to the
    last released build with `(website repo) node scripts/sync-app-fallback.mjs`.
  - `scripts/upload-release.mjs` needs NO manual version edit — it reads `version` /
    `versionCode` from `app.json` at runtime and derives the file name, size and notes.
- Release builds run from `C:\bs` (LongPaths is disabled on `E:\`, so Gradle must run there); keep
  `C:\bs` as a mirror of `mobile/` (including `keystores/`).
- Build the signed release APK from `C:\bs\android` via `gradlew assembleRelease`, then upload with
  `node scripts/upload-release.mjs` (secrets in `C:\bs\.env.local`). This pushes the APK + a
  `release.json` manifest to the `app-releases` Supabase bucket that both the website `/app` page
  and the in-app updater read.
- `scripts/sync-version.mjs` only publishes the manifest — it must NOT be the first thing run after
  a version bump, because it advertises a version whose APK may not be uploaded yet. It now guards
  against this: it aborts unless `genum-solutions-<version>.apk` (the versioned file written by
  `upload-release.mjs`) responds on the bucket, or you pass `--force`. The normal release order is:
  bump version -> build APK (`gradlew assembleRelease`) -> `upload-release.mjs` (uploads APK +
  manifest in one step) -> sync the website fallback (`genumsolutions-website`: `node
  scripts/sync-app-fallback.mjs`) and push it.

# Update channels (v2.0.4+)

- **Releases** (`release.yml`): every release bumps `app.json` version + `versionCode` and
  installs as a NEW APK. The build NEVER publishes an OTA bundle: an OTA bundle carries the JS
  copy of `APP_VERSION`, so delivering it to a device on the OLD native build makes that device
  self-report the NEW version and suppresses the "new APK available" pill until the next bump.
- **OTA** (`ota-only.yml`): the SAME-VERSION hot-patch channel for emergency JS/asset fixes
  between releases. It never bumps the version. Because a release commit also touches
  `mobile/src`, the workflow's `release-guard` step skips the run whenever app.json versionCode is
  newer than the published manifest. Runtime implications: `runtimeVersion` stays constant
  (`1.0.0`) for a native generation — never bump it without a native rebuild.

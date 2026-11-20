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
- `C:\bs\.env.local` also holds `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token, launched
  2026-10-08, **expires ~2026-11-07**) for applying migrations without the CLI via the Management API
  `POST /v1/projects/jxgmbodzkmxanuwfaqxo/database/query` (one SQL statement per request). It is a
  secret: never print or commit it; rotate before it expires.
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
  newer than the published manifest. `app.json` derives `runtimeVersion` from `appVersion`,
  so an OTA only applies to a native build with that same app version; publish a matching
  native build before changing the app version.

# Dependencies (known advisories)

`npm audit` (2026-11-19) reports 1 high + 16 moderate, all in the Expo/Metro build
toolchain, none in code that ships inside the APK:

- **high — `image-size` 1.2.1** (JXL/HEIF/ICNS infinite-loop DoS, GHSA-5p2g-fcmc-qvqq,
  GHSA-w3rx-r6r6-pgpr), reached only through `expo -> @expo/metro -> metro@0.83.3`.
  Metro calls the 1.x API; forcing `image-size@2.1.0` via a package.json override
  **breaks bundling** (`assetslogo.png: The "list" argument must be an instance of
SharedArrayBuffer, ArrayBuffer or ArrayBufferView`), verified with
  `npx expo export --platform android`. The fix arrives with the Metro release that
  declares `image-size@^2` (lands with Expo SDK 58) — do not override it.
- **moderate — `glob` / `minimatch`** inside `@expo/cli`, `expo-updates`,
  `@expo/fingerprint` (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). Only reachable while
  bundling/prebuilding, against file trees in this repo or CI.

Patched versions: `image-size` 2.0.3, `glob` 14.0.2, `minimatch` 11.0.1 — all above the
ranges Expo SDK 54 pins. Impact is limited to a local/CI build being made slow or
wedged by a hostile file name or image; a cracked release build is a failed CI run, not
a compromised device. `npm audit fix --force` must NOT be used: it proposes downgrading
`expo` to 52 or installing `expo-updates@58`, which breaks the SDK 54 tree. Upgrade plan:
`docs/SDK-58-UPGRADE.md`. The Dependabot alerts (8, 7, 53, 52) close at that upgrade,
or can be dismissed as "vulnerable code is not reachable" in the meantime by the repo
owner.

Re-verified 2026-11-20 on 3.4.4: same four advisories, still nothing installable within
SDK 54. `glob` is flagged over `>=9.0.0 <=14.0.1` and `minimatch` over
`>=7.0.0 <11.0.1`, and the packages that pull them pin majors that cannot reach the
fix — `@expo/cli@54.0.28` declares `glob@^13.0.0` + `minimatch@^9.0.0`,
`expo-updates@29.0.20` declares `glob@^13.0.0`. The two highs stay on
`@expo/metro@54.2.0 -> metro@0.83.3 -> image-size@1.2.1`; `@expo/metro@latest` moves to
`metro@0.87.1`, which no longer depends on `image-size` at all, so they close with the
SDK bump and only with it. Non-forced `npm audit fix` is not a shortcut: the only route
it offers to `image-size` 2.x is out of Metro's declared range (that is the export
breakage above), and it otherwise rewrites hundreds of optional platform binaries.
Overriding `glob@^14` / `minimatch@^11` into `@expo/cli`'s tree is the fallback the
upgrade plan sanctions, but it belongs after the bump, where `expo export` can confirm
`@expo/cli` still walks the tree correctly.

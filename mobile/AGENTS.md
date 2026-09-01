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

- Keep the version in sync everywhere on every release so installs update over-the-top AND the
  website download page matches:
  1. `app.json` -> `version` and `android.versionCode`
  2. `src/config/site.ts` -> `APP_VERSION`
  3. website `lib/company.ts` -> `androidApp.version` / `versionCode` / `sizeLabel`
  4. `scripts/upload-release.mjs` -> `VERSION` / `APK_SIZE_MB` / `notes`
- Release builds run from `C:\bs` (LongPaths is disabled on `E:\`, so Gradle must run there); keep
  `C:\bs` as a mirror of `mobile/` (including `keystores/`).
- Build the signed release APK from `C:\bs\android` via `gradlew assembleRelease`, then upload with
  `node scripts/upload-release.mjs` (secrets in `C:\bs\.env.local`). This pushes the APK + a
  `release.json` manifest to the `app-releases` Supabase bucket that both the website `/app` page
  and the in-app updater read.

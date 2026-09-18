# Genum Solutions Mobile App

Expo SDK 54 (React Native + TypeScript) Android app for **GENUM SOLUTIONS PVT. LTD.**
(`com.genumsolutions.app`). The app is **fully native with its own UI/UX** — it is NOT a
WebView mirror of the website. There is no WebView and no `WEBSITE_URL`; the app and the
website share ONLY the Supabase database (`products`, `services`, `carts`, `orders`,
`profiles`, `robo_car_modes`, `push_tokens`, `company_info`, `site_content`,
`customer_messages`).

- **Navigation:** `@react-navigation` bottom tabs (Home / Shop / Cart / Account) +
  native-stack screens (ProductDetail, Checkout, OrderSuccess, Services, Projects,
  Contact, About, Tools). See `src/navigation/RootNavigator.tsx` + `src/navigation/types.ts`.
- **State:** `src/context/AppContext.tsx` holds auth + cart. Native Supabase auth via
  `src/services/authService.ts` (email/password, Google, reset). Session persisted in
  SecureStore.
- **Data layer:** `src/services/` (`productService`, `serviceService`, `cartService`,
  `orderService`, `projectService`) read the shared tables with the anon key (RLS allows
  public SELECT).
- **Styling:** NativeWind (`global.css`) + theme tokens in `tailwind.config.js` (mirrors
  the website's `genumsolutions-website/tailwind.config.ts` navy/ink/gold palette).
- **Config:** `src/config/` has `site.ts` (`APP_VERSION` only), `company.ts` (offline
  fallback for `company_info`), `supabase.ts`, `update.ts` (APK/manifest URLs).
- **Device remote stack:** BLE / classic-BT / WiFi transport for the GENUM robo-car fleet
  (`src/services/bleService.ts`, `sppService.ts`, `wifiService.ts`, `carProtocol.ts`).

> **Shared schema source of truth:** `genumsolutions-website/supabase/schema.sql` (sibling
> repo). The app's `mobile/supabase/` folder is intentionally empty. Keep fallback config
> files here (`roboCarCatalog.ts`, `project-catalog.ts`, `journal.ts`, `company.ts`) in sync
> with the website's `lib/` mirrors and the live DB.

---

## Run locally

```bash
npm install         # install dependencies (first time)
npm start           # start Expo dev server (QR code for Expo Go)
npm run android     # open on Android emulator / device
```

---

## Environment

Copy/keep the gitignored `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=        # project URL, e.g. https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=   # public anon key (RLS-gated; fine to embed)
SUPABASE_URL=                    # same project URL (script/upload fallback)
SUPABASE_SERVICE_ROLE_KEY=       # server-only, used by scripts/upload-release.mjs
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Only the **anon key** reaches the app bundle. The service-role key stays out of it.

---

## Google sign-in setup (one-time)

1. In the Supabase dashboard, enable the Google provider
   (Authentication → Providers → Google) with an OAuth client from
   https://console.cloud.google.com/apis/credentials.
2. Add `genumsolutions://auth` to Supabase → Authentication → URL Configuration →
   **Redirect URLs** (matches `scheme` in `app.json`). The Android OAuth client's SHA-1
   fingerprint must match the release signing keystore.

Google Sign-In is native (`@react-native-google-signin/google-signin`), not routed
through any WebView.

---

## Release & update channels

Bump together on every release so installs update over-the-top:

- `version` + `android.versionCode` in `app.json` (single source of truth)
- `APP_VERSION` in `src/config/site.ts`
- `package.json` `version` + lock (via `node scripts/bump-version.mjs <ver> <code>`)

The website's bundled fallback (`genumsolutions-website/lib/company.ts` → `androidApp`) is
**NOT** bumped in advance — the `/app` page reads the LIVE `release.json` manifest. After an
APK upload, sync the fallback: `(genumsolutions-website) node scripts/sync-app-fallback.mjs`.

Build notes:

- LongPaths is disabled on `E:\`, so release Gradle builds run from a mirror at `C:\bs`
  (keep `C:\bs` in sync with `mobile/`, including `keystores/` and `.env.local`).
- Upload the signed APK with `node scripts/upload-release.mjs` (secrets in `.env.local`).
- OTA hot-patches: `ota-only.yml` (JS-only, same version). `runtimeVersion` stays `1.0.0`
  unless a native rebuild ships.
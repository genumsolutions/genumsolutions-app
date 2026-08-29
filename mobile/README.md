# Genum Solutions Mobile App

Expo SDK 54 (React Native + TypeScript) app for Genum Solutions. The app is a **hybrid
native shell around the company website** loaded in a full-screen WebView:

- `src/screens/SiteScreen.tsx` — the website (`WEBSITE_URL` in `src/config/site.ts`),
  restyled to feel like an app via injected CSS/JS (`src/webview/inject.ts`).
- Native chrome that mirrors the site's state through a postMessage bridge:
  `AppHeader`, `Drawer`, `TabBar`, `CartBar` (cart count/size, session, current path,
  connectivity all flow from the WebView into `AppContext`).
- Native `SignInSheet` (email/password + Google) — Google OAuth runs in a system
  browser tab because Google blocks OAuth inside embedded WebViews. The session is
  handed to the website via `/api/auth/native-handoff` so the WebView stays signed in.
- Offline-first: the website's service worker caches visited pages and the public
  product catalog; the app shows a non-blocking "offline" pill and reloads on reconnect.

> The website lives in the sibling `genumsolutions-website` repo. The app mirrors it and
> must stay in sync with it (SW caching, handoff endpoint, brand tokens).

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
```

Only the **anon key** reaches the app bundle. The service-role key stays out of it.
Native sign-in is disabled until the anon key is set — the website's own login page
is the fallback.

---

## Google sign-in setup (one-time)

1. In the Supabase dashboard, enable the Google provider
   (Authentication → Providers → Google) with your OAuth client from
   https://console.cloud.google.com/apis/credentials.
2. Add `genumsolutions://auth` to Supabase → Authentication → URL Configuration →
   **Redirect URLs** (matches `scheme` in `app.json` and `NATIVE_AUTH_REDIRECT` in
   `src/config/supabase.ts`).

After a native sign-in the app POSTs the tokens to `/api/auth/native-handoff` on the
website (see the `genumsolutions-website` repo), which validates them and writes the
site's Supabase auth cookies so the WebView behaves as signed in.

---

## Release

Bump together on every release so installs update over-the-top:

- `version` and `android.versionCode` in `app.json`
- `APP_VERSION` in `src/config/site.ts`
- `APK_VERSION` in `components/AppBanner.tsx` (website repo)

Build notes:

- LongPaths is disabled on `E:\`, so release Gradle builds run from a mirror at
  `C:\bs` (keep `C:\bs` in sync with `mobile/`).
- Upload the signed APK with `node scripts/upload-release.mjs` (secrets in
  `.env.local`).
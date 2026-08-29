# Fix: Native Google sign-in redirects to browser → 404, never returns to app

## Diagnosis (confirmed)
- The APK the user tested (v1.3.0, built 8/29 11:09 PM) still contains the OLD
  PKCE Chrome-Custom-Tab Google flow.
- That flow opens a browser to Supabase→Google; after login Supabase redirects to
  `genumsolutions://auth`, which is NOT in Supabase's Redirect-URL allowlist → the
  callback dies with a 404 and the app never receives the result → stuck in browser.
- The NEW native Google code (committed on dev/main) never opens a browser, but is
  not in any built APK yet.
- google-signin v16.1.4 has NO `nonce` support → Supabase Google provider must have
  **"Skip nonce checks"** enabled (manual step).
- Current `app.json` registers the plugin in the with-Firebase form → gradle would
  fail without `google-services.json`.

## Decision
User chose: **Ship the fixed build now** (guard hides Google until configured; a later
rebuild enables it once GCP/Supabase config is added).

## Steps

### 1. Code guard + cleanup (mobile)
- `src/config/supabase.ts`: add
  - `export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''`
  - `export const googleConfigured = Boolean(googleWebClientId)`
- `src/services/authService.ts`:
  - Import `googleConfigured`; remove unused `import * as WebBrowser` and
    `NATIVE_AUTH_REDIRECT` from the supabase import.
  - In `signInWithGoogle()`: after the `supabaseConfigured` check, if `!googleConfigured`
    return `{ status: 'error', message: "Google sign-in isn't set up in this build yet. Please use email & password instead." }`.
- `src/components/SignInSheet.tsx`:
  - Import `googleConfigured`.
  - Google button `disabled={authBusy || !supabaseConfigured || !googleConfigured}`.
  - Replace static notice text with conditional: when `!googleConfigured` show
    "Google sign-in is being set up — use email & password instead."

### 2. Plugin form (mobile/app.json)
- Replace `"@react-native-google-signin/google-signin"` with
  `["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.PLACEHOLDER" }]`
  (without-Firebase path → no `google-services.json` required; placeholder is iOS-only/ignored on Android).

### 3. Version bump to 1.3.1 (drives in-app update prompt)
- `mobile/app.json`: `version: "1.3.1"`, `android.versionCode: 5`
- `mobile/src/config/site.ts`: `APP_VERSION = '1.3.1'`
- `website/components/AppBanner.tsx`: `APK_VERSION = '1.3.1'`
- `mobile/scripts/upload-release.mjs`: `VERSION = '1.3.1'`, set `APK_SIZE_MB` to measured size of built APK

### 4. Rebuild + upload
- Mirror `mobile/` → `C:\bs` (robocopy /E /XD node_modules android keystores releases .git .expo .claude)
- `npx expo prebuild` (non-clean) in `C:\bs`
- `gradlew assembleRelease` from `C:\bs` (ANDROID_HOME set; do NOT run gradle on E:\)
- Print SHA-1 of `genum-release.jks` for the user's Google Cloud Console Android client
- Copy APK → `mobile/releases/genum-solutions-1.3.1-arm64-v8a.apk`
- `node scripts/upload-release.mjs` (uploads `genum-solutions-latest.apk` + `release.json` v1.3.1)
- Typecheck both repos first.

### 5. Manual steps (user) — enable real Google sign-in later
1. Google Cloud Console → Web OAuth client → Client ID → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
2. Google Cloud Console → Android OAuth client (package `com.genumsolutions.app` + SHA-1)
3. Supabase → Auth → Providers → Google: enable, add web client ID to Authorized Client IDs, enable **Skip nonce checks**
4. Supabase → Redirect URLs: add `genumsolutions://auth`
5. Rebuild once with the real web client ID → native picker works, no browser.

## Verification
- `npm run typecheck` (mobile), website `typecheck` + `next lint`
- `npx expo-doctor` after prebuild mirror
- Confirm new APK shows v1.3.1 and Google button hidden (with notice) until configured.
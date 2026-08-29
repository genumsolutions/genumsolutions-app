# Expo version

This project uses Expo SDK 54 (see package.json: `expo ~54.0.37`). Read the SDK 54 docs at
https://docs.expo.dev/versions/v54.0.0/ before writing any code. Do NOT follow SDK 57 guidance.

# Architecture

The app is a full-screen WebView mirror of the company website (see `src/config/site.ts` ->
`WEBSITE_URL`). The only native screens are `src/screens/SiteScreen.tsx` (the WebView) and
`src/screens/ToolsScreen.tsx` (IoT demo panel). Do not add native screens that "reimplement"
website features - mirror instead.

# WebView constraints

- **Google OAuth does not work inside an embedded Android WebView.** Google blocks OAuth
  callbacks in WebViews by design. Email/password sign-in is the primary path; `setSupportMultipleWindows`
  is off and OAuth popups are surfaced through a dedicated popup modal. Do not "fix" this by
  routing OAuth through the WebView - it will fail.

# Release

- Bump `version` and `android.versionCode` together in `app.json` (and `APP_VERSION` in
  `src/config/site.ts`) on every release so installs update over-the-top.
- Release builds run from `C:\bs` (LongPaths is disabled on `E:\`, so Gradle must run there);
  keep `C:\bs` as a mirror of `mobile/`.
- Upload the signed APK with `node scripts/upload-release.mjs` (secrets in `.env.local`).


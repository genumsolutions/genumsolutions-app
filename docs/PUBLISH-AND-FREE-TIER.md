# Publish & free-tier discipline (app side)

How to get a new app version onto the phone without spending free-tier quota,
and what is blocked from this machine.

## The short version

The **only** step that must happen on the release machine (the `C:\bs` mirror
that holds the Android project + the release keystore) is the signed APK build:

    # On the C:\bs mirror (has android/ + keystores + ANDROID_HOME + Java):
    cd C:\bs\android
    .\gradlew assembleRelease

That produces `genum-solutions-3.4.5-arm64-v8a.apk` in `C:\bs\mobile\releases\`.
Copy that single APK file into this repo at `mobile/releases/`:

    mobile/releases/genum-solutions-3.4.5-arm64-v8a.apk

Then, from this checkout (we already have the Supabase service-role key in
`mobile/.env.local`), one command publishes it to the bucket **and** writes the
manifest the phone and the website read:

    cd mobile
    node scripts/upload-release.mjs

That single command:
- uploads `genum-solutions-3.4.5-arm64-v8a.apk` and `genum-solutions-latest.apk`
  to the `app-releases` Supabase bucket,
- writes `release.json` (version 3.4.5 / 69, size, notes, updated_at),
- prunes old superseded versioned APKs on the bucket (keeps the newest 3 by default).

After that, sync the local `apk/` mirror so the repo carries the build:

    cd ..
    node root-apk-sync.mjs

Then fix the README "Current published version" line to match (it is currently
stale — it claims 3.4.5/69 is already published, but the bucket was still 3.4.4/68
when that line was written).

## OTA (app-only changes, no rebuild)

Once the phone is on 3.4.5, app-only changes (JS/assets/source, no native/config
changes) publish without a rebuild and without action minutes:

    cd mobile
    npm run publish:ota

This calls `npx eas-cli update --channel production ...`. Two things must be true
for it to actually reach the phone:

1. The phone must already be on the matching native version (3.4.5) — OTA is
   same-version only.
2. `EXPO_TOKEN` must be a **real Expo access token** (from expo.dev → Account
   Settings → Access Tokens). The token currently saved in `mobile/.env.local`
   under `EXPO_TOKEN` is a Vercel token (`vcp_...`) and does **not** authenticate
   EAS — OTA publish will fail with "bearer token is invalid" until a real Expo
   token is put there (or until `eas login` is run on the machine once).

Note: the OTA publish channel was corrected to `production` to match the channel
the app reads (`app.json` `requestHeaders.expo-channel-name: "production"`). The
previous `--branch main` would have silently failed to deliver.

## What does NOT spend free-tier quota from this machine

- Reading the bucket manifest / APK URLs (read-only, no quota).
- Running `root-apk-sync.mjs` to mirror already-published APKs into `apk/`
  (downloads only already-published files; does not create new bucket objects).
- Running `release-ready-check.mjs` (read-only).
- The `node scripts/upload-release.mjs` step writes to the bucket, but only the
  exact APK + manifest that a release requires — not extra objects.

## What DOES require the release machine (and must not be done from here)

- Building the signed APK: needs `android/`, the release keystore, `ANDROID_HOME`,
  and Java. None of these exist in this checkout. Do not try `eas build` from here
  to "save a trip" — it would build in the cloud with the wrong keystore signature
  (so it could not install over the top on the phone) and would spend EAS build
  minutes.

## Free-tier guardrails

- The app never uploads image bytes itself — that path is enforced by the
  `link-import` edge function and the shared budget in
  `docs/STORAGE_BUDGET.md` (see the website repo for the authoritative table).
- Do not advance the website fallback (`genumsolutions-website` `sync-app-fallback.mjs`)
  before the APK is actually published — that would advertise a version whose APK
  isn't ready.
- Keep `apk/` releases deliberate: only real published releases go in there, mirrored
  by `root-apk-sync.mjs`. Do not hand-place scratch APKs there.

## Current reality (as of writing)

- Repo app-side version fields agree on **3.4.5 / 69** (app.json, package.json,
  site.ts, release-notes.json).
- The **bucket** still serves **3.4.4 / 68** (`release.json` + the `latest.apk`),
  because the signed 3.4.5 APK has not been built/uploaded yet.
- The **phone** is on 3.4.4 and sees no update (installed code 68 == manifest code 68).
- The **one blocked step** is the signed 3.4.5 APK build on the `C:\bs` mirror.
  Everything after that (upload, sync, README fix) can run from here.

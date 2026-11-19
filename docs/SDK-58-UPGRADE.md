# Expo SDK 58 upgrade plan

**Why now:** the four open Dependabot alerts (`image-size` GHSA-5p2g-fcmc-qvqq /
GHSA-w3rx-r6r6-pgpr, `glob` GHSA-3g3m-2fjr-6pw4, `minimatch` GHSA-g3hv-75wg-m249) have
no installable fix on SDK 54. Forcing `image-size@2.1.0` breaks Metro's asset pipeline
(verified: `expo export` fails on `assets\logo.png` with "The list argument must be an
instance of SharedArrayBuffer, ArrayBuffer or ArrayBufferView"), and `glob@14.0.2` /
`minimatch@11.0.1` are above what `@expo/cli` and `expo-updates` pin. The SDK move is
the only real fix — see "What actually closes the advisories" at the end.

**Not doing in this document:** nothing is upgraded here. This is the plan to follow on
a branch, one SDK at a time.

## Current state (3.4.4)

| Piece                   | Now                   | SDK 58                                       |
| ----------------------- | --------------------- | -------------------------------------------- |
| `expo`                  | 54.0.38               | 58.x (latest tag 58.0.26 at time of writing) |
| `react-native`          | 0.81.5                | 0.88.x                                       |
| `react`                 | 19.1.0                | 19.3.0                                       |
| Metro                   | 0.83.3                | 0.87.x                                       |
| Node                    | 22 (CI + local 22.23) | **≥ 22.13** — current setup is already fine  |
| JDK                     | 17 (`release.yml`)    | 17 (AGP 9.2 still requires 17)               |
| compileSdk / buildTools | 36 / 36.0.0           | **37 / 37.0.0**, targetSdk stays 36          |
| AGP / Gradle            | ~8.x                  | **9.2.1 / 9.4.1**                            |
| Kotlin                  | 2.1.x                 | 2.2.0                                        |
| R8 minify               | off in release        | **on by default**                            |

Version pins come from the SDK 58 changelog and the Expo SDK reference table; the
Android numbers from RN 0.88's `gradle/libs.versions.toml`.

## Repo-specific facts already checked

- **Removed RN APIs are not used.** No `InteractionManager`, no `Modal animated`, no
  `StatusBar` `backgroundColor`/`translucent`/`networkActivityIndicatorVisible`, no
  `react-native/Libraries/*` deep imports, no `ImageBackground` (grep over `mobile/src`).
  The RN 0.87 removals should therefore be a typecheck-only exercise.
- **`expo-updates` runtime identity is `appVersion`.** `app.json` derives
  `runtimeVersion` from `appVersion`, so an SDK bump _must_ ship as a new native
  version (`3.5.0` / versionCode `69`), never as an OTA onto 3.4.x installs.
- **`release.yml` pins Android packages.** The workflow installs
  `platforms;android-36` and `build-tools;36.0.0` explicitly; SDK 58 needs
  `platforms;android-37` and `build-tools;37.0.0` or prebuild/gradle fails on a runner
  that ships no SDK. Java stays 17.
- **Local config plugin touches AGP output.** `mobile/plugins/with-release-signing.js`
  edits the generated `android/app/build.gradle` to wire the release `signingConfig`.
  AGP 9 is a major; this plugin is the single most likely thing to break the release
  build and must be checked against a fresh prebuild before any upload.
- **R8 is on by default.** The BLE and Google libraries
  (`react-native-bluetooth-classic@1.73.0-rc.17`, `@sfourdrinier/react-native-ble-plx`,
  `react-native-google-signin`, `expo-notifications`) use reflection/JNI. A release APK
  that builds but cannot connect to a car is the failure mode to hunt; keep rules may
  be needed via `expo-build-properties` (`android.extraProguardRules`).
- **No `expo-build-properties` today**, so no stale `compileSdkVersion` pin to delete —
  if one is added during the upgrade, it must not pin 36.
- **Release builds run from `C:\bs`**, a mirror of `mobile/`, because Gradle breaks on
  `E:\` without LongPaths. After the upgrade, delete `C:\bs\android` (or re-run
  prebuild there) so the mirror does not carry SDK 54 native output.
- **CI gates that must stay green**: `typecheck`, `eslint .`, `vitest` +
  `test:count` (baseline 1114/84), `expo-doctor`, `check-app-json-paths`,
  `check-release-notes`, layout smoke (Playwright), app-vs-website parity.

## Strategy: step 54 → 55 → 56 → 57 → 58

Expo's own guidance is to upgrade **one SDK at a time** to pinpoint breakage; this jump
crosses four SDKs and three React Native minors (0.81 → 0.88). One branch, one commit
per step, all gates green before the next step. If a step's breakage is trivial, the
step cost is a few minutes; if it is not, you know exactly which SDK introduced it.

Branch: `sdk-58-upgrade` (never on `main` — a `mobile/app.json` change on `main`
triggers `release.yml`, which builds and **publishes**).

### Per step (55, 56, 57, 58)

1. `npx expo install expo@^<sdk>.0.0 --fix`
2. `npx expo install --fix` again if doctor reports skew; `npx expo-doctor`
3. Read that SDK's changelog "Upgrading your app" section before fixing errors.
4. `npx tsc --noEmit` — surfaces the RN type/API changes first and cheapest.
5. `npx eslint .`
6. `npx vitest run` then `npm run test:count` (must not shrink).
7. `npx expo export --platform android` — proves Metro + assets + image-size work.
8. `node scripts/check-app-json-paths.mjs`, `npm run check:release-notes`.
9. Commit: `build(deps): move to Expo SDK <n>`.

Do **not** bump `app.json` version during these steps — a dev-client build of the same
version keeps OTA/update checks quiet and avoids publishing anything.

### Step 5 (SDK 58 specifically)

- `npx expo prebuild -p android --clean` in a scratch copy, then diff
  `android/app/build.gradle` and `android/gradle.properties` against the 3.4.4 output.
  Confirm the release-signing plugin still finds and rewrites `signingConfig`, and that
  the generated versions are `compileSdk 37 / targetSdk 36 / AGP 9.2.1 / Gradle 9.4.1`.
  Remember: `bump-version.mjs` now skips a missing `android/` – that is expected here.
- Build a **release** APK (R8 on), not just debug. Install it and exercise:
  Bluetooth car connect + drive, Wi-Fi car page, Google sign-in, push permission,
  in-app updater (it must report "up to date" at the same version).
- If BLE/Google break, add keep rules via `expo-build-properties`
  (`android.extraProguardRules`) rather than disabling R8.

### Then the release

1. Bump to `3.5.0` / versionCode `69` (`node scripts/bump-version.mjs 3.5.0 69`),
   add the `3.5.0` entry to `mobile/release-notes.json` (CI fails without it).
2. `npm run release:ready` — expect a manifest mismatch until the upload; that is the
   documented pre-upload state.
3. Push the bump: `release.yml` builds, signs, uploads the APK + manifest.
   `mobile/AGENTS.md` says signed builds run from `C:\bs`; the CI workflow is the
   alternative that needs no local Gradle.
4. After the manifest reports 3.5.0/69: `genumsolutions-website` →
   `node scripts/sync-app-fallback.mjs`, commit, push.
5. Update `mobile/AGENTS.md` "Dependencies (known advisories)" (replace the SDK 54
   paragraph) and `docs/DEVICE_CONTROL_ROADMAP.md` session log.

## What actually closes the advisories

Verified against the published packages (2026-11-19):

- `metro@0.87.1` **no longer depends on `image-size`** (`metro@0.83.3` did), and
  `metro-transform-worker@0.87.1` has no `image-size` dependency either → the two high
  `image-size` alerts (8, 7) go away with the Metro bump.
- `@expo/cli@58.1.21` and `@expo/config-plugins@58.0.13` no longer declare `glob` or
  `minimatch` directly → the two medium alerts (53, 52) should go with the Expo bump.
  `expo-updates@58.0.22` likewise lists neither.

This is package-level evidence, not a guarantee: after step 5 run

```sh
npm audit --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).metadata.vulnerabilities))"
```

If a transitive `glob`/`minimatch` survives, pin it with an `overrides` entry (the repo
already carries overrides for `shell-quote`, `postcss`, `node-forge`, `compression`,
`undici`) and confirm `expo export` still passes. Do **not** use `npm audit fix --force`
at any point: it offers `expo@52` (a downgrade) and `expo-updates@58` on the SDK 54 tree.

The four alerts (8, 7, 53, 52) are currently open; they should be auto-closed when a
resolved version lands in `package-lock.json` on `main`.

## Risks, in the order they are likely to bite

| Risk                                                | Where                                    | Mitigation                                                                 |
| --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Release-signing plugin vs AGP 9 template            | `mobile/plugins/with-release-signing.js` | prebuild + diff, then a signed local build before any push                 |
| BLE/Google libs under R8                            | release APK only                         | keep rules via `expo-build-properties`; bench the car                      |
| Strict TS API (refs → `ViewInstance`, deep imports) | `tsc --noEmit`                           | `migrate-to-strict-api` skill or mechanical fixes per file                 |
| Removed `InteractionManager` / `StatusBar` props    | none found in `src`                      | re-grep after step 4 anyway                                                |
| Android SDK pins in CI                              | `.github/workflows/release.yml`          | bump to `android-37` + `build-tools;37.0.0` in the same PR as the bump     |
| `android/gradle.properties` optimisations step      | `release.yml`                            | re-check the sed'd `-Xmx4096m` / caching flags still apply to AGP 9 output |
| OTA delivered to old native builds                  | `ota-only.yml`, `runtimeVersion`         | no OTA between 3.4.x and 3.5.0; release APK first                          |
| Layout regressions (RN 0.88 text/measure changes)   | Playwright smoke + parity jobs           | run both jobs on the upgrade branch (they run on PRs)                      |

## Rollback

The upgrade branch is disposable: `main` stays on 3.4.4 throughout, so abandoning it
costs nothing. Once 3.5.0 is published, the SDK 54 build stays downloadable as
`genum-solutions-3.4.4.apk` (the bucket keeps `release.json` + latest + the current and
one previous versioned APK), and the in-app updater will not offer a downgrade — a
rollback therefore needs a new version (`3.5.1`) built from an SDK 54 revert commit,
not a re-upload of 3.4.4.

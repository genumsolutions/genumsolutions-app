# NEXT SESSION — genumsolutions-app (R-20/R-20a shipped 2026-09-19)

**Current state:** 3.2.3 / versionCode 56, all pushed (`ac62ef6` R-20 feat →
`832c96a` R-20a updater repair (OTA to 3.2.x devices) → `9085d56` bump +
`runtimeVersion: {policy: "appVersion"}`). Tree clean, `main` == origin.
Pipelines verified: release run `35439635378` green; live `release.json` =
3.2.3/56; `latest.apk` + website `/app` fallback synced (bot `6915544`).

## Open items

1. ⏳ **OWNER: restart the app** → 3.2.3/56 installs; verify:
   - App sections show the **native installed version** (not a JS constant).
   - "Update available" appears only when a newer build exists — and after
     downloading, the installed version ACTUALLY changes (the stale-cache loop
     is dead: per-release filename + delete-before-download).
   - The R-20 drive changes: fixed-speed joystick, Speed slider in the top
     strip in every mode, steering only in Settings, STEER-limit edit mirrors
     car truth (`;STEER=`).
2. 🔜 **RELEASE-NOTES-DRAFT.md** (guide/, FIN-35): refresh app line to
   3.2.3/56 + add a "Bug fixes" block — updater stale-cache fix, native
   version display, runtime policy change.
3. 🔜 **FIN-36:** version-defining commit for `v3.2.3` = `9085d56` (the bump
   commit — consistent with v3.0.0/v3.1.0/v3.2.0/v3.2.1 convention).
4. 🧹 **Cleanup candidates (next calm session):**
   - `TwoWd1mExtras.tsx` is dead code (steering/trim editing lives in
     Settings) — delete + sweep imports.
   - `commitSteerLimit` is exported-but-unused in `useControlHub.ts` (kept for
     API symmetry when R-20 landed) — either wire it or drop it.
   - `updateService.test.ts` has no coverage of the new cache-target logic —
     worth a unit test (mock `File.downloadFileAsync`, assert the versioned
     filename + delete-before-download order).

## Do-not-regress (the R-20a lessons)

- NEVER pass `idempotent: true` for the APK download target, and never use a
  fixed filename — cache poisoning was the entire "old version forever" bug.
- NEVER hardcode `runtimeVersion` again — `appVersion` policy keeps OTA
  bundles pinned to their own native release. A static runtime let JS from
  3.2.2 self-report on 3.2.1 natives and broke every version check.
- Version LABELS use `installedAppVersion()` (expo-constants), not
  `APP_VERSION` — the JS constant drifts after installs/OTAs.
- OTA push discipline unchanged: JS-only pushes (no version files) ride
  ota-only.yml and reach ALL devices of the matching runtime; version bumps
  always ride the APK (release.yml skips OTA on bump pushes — that skip is
  correct, do not "fix" it).

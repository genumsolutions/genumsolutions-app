# NEXT SESSION — genumsolutions-app (R-20/R-20a shipped 2026-09-19)

**Current state:** 3.2.3 / versionCode 56, all pushed (`ac62ef6` R-20 feat →
`832c96a` R-20a updater repair (OTA to 3.2.x devices) → `9085d56` bump +
`runtimeVersion: {policy: "appVersion"}`). **R-20b editor (2WD1M panel + toggle
`1ae57a0`) was REVERTED in R-21b — the ESP remote owns 2WD1M editing now, so the
duplicate app editor + its Settings switch were removed (no version bump; rides
OTA-only).** **2026-09-20 cleanup (commit `4967c70`, PUSHED same day as inert
OTA `4da93d9` via ota-only.yml — same-version, no bump):** dead
`TwoWd1mExtras.tsx` + its props type deleted, unused `commitSteerLimit` dropped,
`cacheFileNameFor()` extracted + pinned by `updateService.test.ts` (R-20a cache
contract; tsc clean, vitest 73/73). Pipelines verified: release run
`35439635378` green; live `release.json` = 3.2.3/56; `latest.apk` + website
`/app` fallback synced (bot `6915544`).

## Open items

1. ⏳ **OWNER: restart the app** → 3.2.3/56 installs; verify:
   - App sections show the **native installed version** (not a JS constant).
   - "Update available" appears only when a newer build exists — and after
     downloading, the installed version ACTUALLY changes (the stale-cache loop
     is dead: per-release filename + delete-before-download).
   - The R-20 drive changes: fixed-speed joystick, Speed slider in the top
     strip in every mode, steering only in Settings, STEER-limit edit mirrors
     car truth (`;STEER=`).
   - The 2WD1M editor page + its Settings toggle are GONE; 2WD1M steering/trim
     quick-steppers still live in Settings (Steering/Trim rows remain; the
     editor lived on the ESP `SW` long-hold instead).
2. ✅ **RELEASE-NOTES-DRAFT.md** (guide/, FIN-35) — DONE 2026-09-21: app line
   refreshed to 3.2.3/56. The R-20a updater repair now leads "What ships"
   (per-release cache filename + delete-before-download, `appVersion`
   runtimeVersion policy, native-version labels; the 2026-09-20 cleanup +
   vitest 73/73 noted); the stale `runtimeVersion stays 1.0.0` line was
   corrected to the `appVersion` policy; test count 64→73/73; the R-20b 2WD1M
   app editor is confirmed removed pre-release (R-21b, remote-owned editing)
   and NOT listed as a feature.
3. 🔜 **FIN-36:** version-defining commit for `v3.2.3` = `9085d56` (the bump
   commit — consistent with v3.0.0/v3.1.0/v3.2.0/v3.2.1 convention).
4. 🧹 **Cleanup candidates (next calm session):**
   - ~~`TwoWd1mExtras.tsx` is dead code~~ ✅ DONE 2026-09-20 (`4967c70`).
   - ~~`commitSteerLimit` is exported-but-unused in `useControlHub.ts`~~ ✅ DONE 2026-09-20 (`4967c70`).
   - ~~`updateService.test.ts` has no coverage of the new cache-target logic~~ ✅ DONE 2026-09-20 (`4967c70` — 9 tests: per-release filenames, delete-before-download order, always re-download, installer intent, error prefixes).

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

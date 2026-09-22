# NEXT SESSION — genumsolutions-app (P6 round 2026-09-21: role fix + settings + stamp icon)

**Current state:** **3.2.4 / versionCode 57** (`e363377`) — **RELEASED 2026-09-21 via CI**
(P6 push touched `app.json` → `release.yml` run `35631274021` built + uploaded the APK;
`release.json` = 3.2.4/57 live, website fallback synced by bot `07a0359`). This native build
carries everything: the **admin role-revoke fix** (app calls the shared **`admin-set-role`**
edge function — deployed; the old anon-key `profiles.update({ role })` was silently rejected
by the `protect_role_column` trigger), **settingsService** (per-user prefs: cloud theme
adoption on sign-in via `profiles.theme_preference` + shared `user_settings` JSONB — ready
for command keywords etc.), the **company-stamp launcher icon** (all derived assets rebuilt
by `genumsolutions-website/scripts/generate-app-icons.mjs`; OTA cannot change icons — the
stamp ships only with this APK), the FIN-50 reconnect-dedupe, and the R-20/R-20a/R-20b/R-21b
line. Prior state: 3.2.3/56 (`9085d56`) — superseded after one day; its updater now offers
3.2.4 to every older install. Vitest 76/76.

## Open items

1. ⏳ **OWNER: install 3.2.4/57 on the test devices** → via the in-app updater prompt
   (3.2.3/56 installs ARE offered 3.2.4 — the prompt appearing is EXPECTED, it is the
   R-20a updater working) or sideload from the website /app page. After install verify:
   - App sections show the **native installed version 3.2.4 (57)**.
   - **Launcher icon = the company stamp** (only ships with this APK).
   - **Admin role grant/revoke actually works now** (Users tab) — the fix needs 3.2.4+.
   - "Update available" appears only when a newer build exists; after downloading, the
     installed version ACTUALLY changes (stale-cache loop dead).
   - The R-20 drive changes: fixed-speed joystick, Speed slider in the top strip in every
     mode, steering only in Settings, STEER-limit edit mirrors car truth (`;STEER=`).
   - The 2WD1M editor page + its Settings toggle are GONE; 2WD1M steering/trim
     quick-steppers still live in Settings (the editor lives on the ESP `SW` long-hold).
   - Then run `guide/DEVICE-RERUN-2026-09-21.md` (retargeted to 3.2.4/57 2026-09-22).
2. ✅ **RELEASE-NOTES-DRAFT.md** (guide/, FIN-35) — DONE 2026-09-21 at 3.2.3/56;
   **refreshed 2026-09-22 to the RELEASED 3.2.4/57** (P6 bullets added — role-revoke,
   shared settings, stamp icon; the stale "push notifications deferred" line corrected:
   web push is LIVE, only the app-side Firebase path is deferred).
3. 🔜 **FIN-36:** version-defining commit for `v3.2.4` = `e363377` (the P6 bump commit —
   consistent with the bump-commit convention). **Re-staged 2026-09-22:** app target
   `v3.2.3`/`9085d56` → `v3.2.4`/`e363377`, website `website-v3.2.3`/`6915544` →
   `website-v3.2.4`/`07a0359` (nothing was ever tagged — re-staging, not a tag move);
   `guide/FIN-36-TAGS.sh --dry-run` re-PASSED all six 2026-09-22. Firmware targets
   unchanged (v1.6.6 / v1.0.10 / v1.8.3 / v1.2.5).
4. 🌉 **ECOSYSTEM UNIFICATION P1–P5 DONE (2026-09-21, pushed):** master docs in
   `guide/` — `ARCHITECTURE.md`, `UNIFICATION-PLAN-2026-09-21.md`,
   `ADMIN-PARITY-MATRIX.md`. App-side changes: **P1** Dashboard gained the
   Transactions card (web mirror, B-6) + canonical tab list `adminTabs.ts` + parity
   tests (`9b406e9`); **P4** Activity tab FIXED — queried a nonexistent
   `admin_activity` table, now reads `activity_log` (`0b607d3`). Web-side:
   tab order aligned to app, home pilot/curriculum from shared tables,
   /tools fleet catalogue (visual only, D-1 parked), activity logging on all
   admin writes. tsc clean, vitest 76/76, all pipelines green. Owner calls:
   W-6 web dark mode, W-3 web-push, P3 design review — **W-6 + W-3 EXECUTED + LIVE
   (2026-09-21):** web dark mode shipped, web push fully activated (edge function +
   VAPID secrets + trigger armed; live-fire verified end-to-end). **P3 machine review:
   2026-09-21 = 26 PASS · 1 SNAG; the snag (dim contrast on /admin) was ROOT-CAUSED +
   FIXED 2026-09-22 (bare form controls — selects/options — outside the dim class-
   override layer; web `70a7c00`) → official re-run 2026-09-22: 27 PASS · 0 SNAG ·
   0 FAIL · 2 DEFER; owner visual pass still open**
   (`guide/P3-REVIEW-CHECKLIST-2026-09-21.md`). App impact: **role-revoke works as soon
   as 3.2.4+ is installed**; shared theme preference is live (`profiles.theme_preference`).
5. 🧹 **Cleanup candidates (next calm session):**
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

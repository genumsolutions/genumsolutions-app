# NEXT SESSION — genumsolutions-app (2026-09-22: tiers + robot preferences round, released 3.2.5/58)

**Current state:** **3.2.5 / versionCode 58** (`5fd10b1`) — **RELEASED 2026-09-22 via CI**
(bump push → `release.yml` run `35688360720` built + uploaded the APK; `release.json` =
3.2.5/58 live, website fallback synced by bot `7bb6cb5`). This native build carries the
**2026-09-22 tiers + robot-preferences round**: **`isPro` in AppContext** (session tier),
**pro-gated Remote window** (free/guest users get a locked explainer before any drive
control mounts; the Control Panel stays open to everyone), **Robot Preferences screen**
(Menu → Pro-only: per-robot code values, tuning parameters, telemetry channels via
`robotSettingsService` → the dedicated `robot_user_settings` table — completely separate
from carts/orders, mirrored on the website, admin-manageable per user from the web Users
tab), plus the **2026-09-22 residue cleanup** (`AutonomousControls`, `WeblinkControls`,
`ModeInfo`, `deviceMemoryService`, `carModeStorage` deleted — all zero-inbound; dead prop
types removed from `tools/types.ts`). Also inside: the entire P6 round (role-revoke via
`admin-set-role`, settingsService cloud-theme adoption, company-stamp icon — icons ship
only with a native APK) and the FIN-50/R-20 line. 3.2.4/57 shipped 2026-09-21 and is
superseded; 3.2.3/56 after one day. Vitest 76/76, CI + OTA green.

**Server side of the tier/robot flow is DONE + VERIFIED:** schema (`profiles.tier` +
`robot_user_settings`, RLS + `protect_tier_column`) applied to the live DB 2026-09-22;
website gates (registered-only /app download) + admin tier toggle + per-user robot-settings
manager shipped; **`genumsolutions-website/scripts/tier-robot-e2e.mjs` = 23/23 PASS vs
production** (tier lifecycle, admin cross-user access, pro gate, 401/403/405 negatives).

## Open items

1. ⏳ **OWNER: install 3.2.5/58 on the test devices** → via the in-app updater prompt
   (3.2.3/3.2.4 installs ARE offered 3.2.5 — the prompt appearing is EXPECTED, it is the
   R-20a updater working) or sign in on the web /app page (download is now
   **registered-only**) and sideload. After install verify:
   - App sections show the **native installed version 3.2.5 (58)**.
   - **Launcher icon = the company stamp.**
   - **§5B device rows E-1..E-7** in `guide/DEVICE-RERUN-2026-09-21.md` — the new
     tier/robot-preference checks (download gate, remote pro gate, tier flip, preferences
     CRUD + web mirror + admin reach, downgrade behaviour).
   - Prior P6 checks still apply: admin role grant/revoke works; no stale "update
     available"; R-20 drive changes; 2WD1M editor stays gone.
   - Then run `guide/DEVICE-RERUN-2026-09-21.md` (retargeted to 3.2.5/58 2026-09-22).
2. ✅ **RELEASE-NOTES-DRAFT.md** (FIN-35) — refreshed to the released **3.2.5/58**
   2026-09-22 (tier + robot-preference bullets added on top of the P6 bullets).
3. 🔜 **FIN-36:** version-defining commits — app **`v3.2.5` → `5fd10b1`** (the bump
   commit), website **`website-v3.2.5` → `7bb6cb5`** (bot fallback-sync commit).
   **Re-staged twice 2026-09-22** (3.2.4 → 3.2.5 the same day, before any tag was cut);
   `guide/FIN-36-TAGS.sh --dry-run` re-passed all six 2026-09-22. Firmware targets
   unchanged (v1.6.6 / v1.0.10 / v1.8.3 / v1.2.5). Cut ONLY after the device gate passes.
4. 🌉 **ECOSYSTEM UNIFICATION:** P1–P5 DONE + pushed (see guide/ARCHITECTURE.md);
   W-6 + W-3 live; P3 machine review 27 PASS · 0 SNAG · 0 FAIL · 2 DEFER (owner visual
   pass still open — `guide/P3-REVIEW-CHECKLIST-2026-09-21.md`). **2026-09-22 adds the
   account/permission layer**: tiers + per-user robot prefs are now a shared, admin-
   managed store across app + web (one table, one API contract, both UIs).
5. 🧹 **Residue cleanup (2026-09-22) — DONE this round:** removed
   `AutonomousControls.tsx`, `WeblinkControls.tsx` (both retired by `RouterPanel`),
   `ModeInfo.tsx`, `deviceMemoryService.ts`, `carModeStorage.ts` + their dead prop types.
   Website removed unreferenced `ProjectCard.tsx`. No other orphans found (`.web.tsx`
   platform files and vitest-discovered tests are false positives — verified).

## Do-not-regress (the R-20a lessons)

- NEVER pass `idempotent: true` for the APK download target, and never use a
  fixed filename — cache poisoning was the entire "old version forever" bug.
- NEVER hardcode `runtimeVersion` again — `appVersion` policy keeps OTA
  bundles pinned to their own native release.
- Version LABELS use `installedAppVersion()` (expo-constants), not
  `APP_VERSION` — the JS constant drifts after installs/OTAs.
- OTA push discipline unchanged: JS-only pushes ride ota-only.yml; version
  bumps always ride the APK (release.yml skips OTA on bump pushes — correct).
- NEW (2026-09-22): tier checks live in AppContext (`isPro`) — never read
  `profiles.tier` ad hoc from screens; the pro gate on RemoteControlScreen is an
  early return BEFORE any transport UI mounts.

# NEXT SESSION — genumsolutions-app (2026-09-22: tiers + robot preferences round, released 3.2.5/58)

**LATEST (2026-09-23, rides the next OTA — JS-only):** **link-based product import round
(arrived with website U-14).** The app admin Products tab now has **"Import by link"** next
to "+ New product": prompt → paste any product URL → the shared `link-import` edge function
extracts details (MakerWorld via anonymous Bambu design API; OpenGraph/JSON-LD fallback for
other shops) → the editor opens pre-seeded (name/description/image/category hint) → staff
fine-tunes → **Save routes through the same create flow** (image downloaded SSRF-safe →
uploaded to the `product-images` bucket → products upsert with `documentation_url` = source
link). Also this round: product writes go through `supabase.functions.invoke('admin-products')`
with real error surfacing + `Alert` toasts into `handleSaveProduct`/`handleDeleteProduct` —
the old raw-fetch + silent anon-key fallback was the root cause of the "saved product never
showed" bug (the edge fn was never deployed). New service functions in `adminService.ts`:
`previewLinkImport`, `createLinkImport`. Related deploy docs: `genumsolutions-website`
SUPABASE_ACCESS_TOKEN restored by owner for 1 week (2026-09-23) for the U-14 edge-fn deploys
(`admin-products` + `link-import` both ACTIVE and live-verified 9/9 + 15/15). App vitest
**140/140**, app tsc clean, web vitest 71/71 + tsc + lint all green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **admin-services write-path parity +
security fix.** `upsertAdminService`/`deleteAdminService` now go through
`supabase.functions.invoke('admin-services')` (JWT attached, real error surfacing + Alert
toasts in save/delete/toggle) instead of the old bare-`fetch` to the edge URL with a direct
anon-key fallback. **The old target was an UNGATED service-role function** — anyone who knew
the URL could create/update/delete services (fixed at the source: the edge fn now re-verifies
the caller role staff+/admin+ exactly like `admin-products`). `EDGE_BASE` removed from
adminService (it was only used by that one call). Service ops UX now mirrors products:
save/delete/show-hide failures surface an alert, never silently drop. App tsc clean, vitest
**140/140**. Related: website has `scripts/verify-admin-services.mjs` (**10/10** live).

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
superseded; 3.2.3/56 after one day. Vitest **137/137** (M3 test-repair round
2026-09-23 closed the 3 failing cartService/roboCarCatalog tests + added the tsc-fix
for the same files — see TRACKS/INDEX.md), CI green.

**Theme parity pushed 2026-09-22 (`78e10f9`, rides the next OTA — JS-only):** the owner's
2-mode decision (website theme → Light/Dim, System removed). The app's **shared**
preference now stores canonical `'light'|'dim'` only; AppContext restore maps a legacy
`'system'`/`'dim'` cloud value → dark, else light, and writes the migrated value back.
**Latent bug fixed:** `saveThemePreference` was writing the canonical `'dim'` into the
`genum-theme-mode` AsyncStorage cache key the restore effect never recognized → dark never
survived restarts; the cache now holds the app mode (light/dark), canonical only the DB
(site + app agree on one `profiles.theme_preference`). The app's OWN native Settings theme
switch keeps its OS option (native OS-follow is by design; the web System state was the
one removed). OTA run for `78e10f9` needs a green confirmation.

**Server side of the tier/robot flow is DONE + VERIFIED:** schema (`profiles.tier` +
`robot_user_settings`, RLS + `protect_tier_column`) applied to the live DB 2026-09-22;
website gates (registered-only /app download) + admin tier toggle + per-user robot-settings
manager shipped; **`genumsolutions-website/scripts/tier-robot-e2e.mjs` = 23/23 PASS vs
production** (tier lifecycle, admin cross-user access, pro gate, 401/403/405 negatives).
Re-verified 23/23 + 6/6 + p3-review 27 PASS/0 SNAG/0 FAIL/2 DEFER after the 2-mode deploy.

## Open items

0. 🔜 **PLANNED + OWNER-AGREED 2026-09-22 — RBAC levels + Admin Settings→Content reorg (rides OTA, no bump):** roles become `customer / staff / admin / owner`; staff = all admin powers EXCEPT deletions; delete-user is **owner-only** (`genumsolutions`); website + app admin tabs both move Training programs / Pilot cost lines / Curriculum highlights from **Settings → Content**, rebuilt as the unified windowed editors (list + editor pane + Preview / Edit / Hide / Delete like Products/Services/Projects); Settings keeps company info only; delete buttons hidden for staff. Website roots the whole effort (`cleanup-test-residue.mjs`, `lib/admin.ts`, schema, edge, routes, AdminContent/AdminUsers) — mirror into this app via `AppContext` role (`isStaff/isOwner`), `AdminScreen` gating + Content panels, `adminService` delete-user.

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
6. 🌗 **Theme parity `78e10f9` (2026-09-22):** ✅ **CONFIRMED 2026-09-23 — OTA run
   35709327384 GREEN.** CI is fully green back to the bump (the only red runs —
   M3 `add unit tests`/`update audit` CI+OTA — were repaired by the 2026-09-23
   test-fix push `ea4d07e`, CI 35818092418 + OTA 35818092425). Flag to the owner:
   the app's own native Settings theme switch still offers its **System/OS-follow**
   option (kept by design, native OS-follow); the website System state was the one
   removed per owner decision #1 — if the app Settings control should also drop
   System, that is a small follow-up.

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

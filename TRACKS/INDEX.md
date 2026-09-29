# genumsolutions-app TRACKS — app·website sync 2026-09-18

> ✅ **2026-09-29 — CONTROL PANEL SNAG ROUND 2 (`cc8f671`→`fdb0941`, six commits, JS-only →
> same-version OTA 3.2.7/60): teaching card removed · SPP false "no longer in the scan list"
> killed (F-40) · methods gated to SPP + Car AP, rest "Coming Soon" (F-41) · speed echo
> change-guarded + linear 100→255 (F-42) · FAB rotation-safe (F-43) · error-placement polish.
> Gates: tsc 0 · vitest 285/285. Owner device round: `mobile/TESTING.md` **U-51-1..5**
> (U-49/U-50 device rows still open). Resume point: `NEXT-SESSION.md` in this folder.

> ✅ **2026-09-27 — U-48 FINAL SNAG ROUND: COMMITTED + PUSHED (`d148457`), CI GREEN, and the OTA
> bundle is PUBLISHED.** App-side wins: admin save-busy + re-entrancy guards
> (`saveSaving`/`contentSaving`), pull-to-refresh on Home/Printing/Tools, pressed feedback +
> `finally`-safe busy guards on the three real async-write gaps (Add-to-cart, cart qty, newsletter),
> and deletion of the U-25 dead list. Gates: tsc 0 · vitest 205/205 · prettier clean.
> No version bump — JS-only, so it shipped as a same-version OTA. `ota-only.yml` auto-triggered on
> the push (it watches `mobile/src/**`) and **succeeded**, and `release.json` now reads
> `"OTA — Short update (d148457…)"` with `updated_at 2026-09-27T16:43Z`; app stays 3.2.6 / 59, no APK
> rebuild. Detail: `guide/PLAN-2026-09-27-U48-FINAL-SNAGS.md` §6–§7 and
> `guide/SESSION-2026-09-27-U48-FINAL-SNAGS.md`. Resume point: `NEXT-SESSION.md` in this folder.

> ✅ **The `site-content` dependency is satisfied — admin content save now works end to end.** The
> website's `site-content` edge function is deployed (v4) and verified live: public `get` → 200,
> admin `upsert` without a token → 401, with a bad token → 401. `upsertSiteContent()` here goes
> through `supabase.functions.invoke`, so the signed-in admin's JWT reaches the function and the
> role check passes. Note the function is deployed with `--no-verify-jwt` on purpose (it has a
> public `get` plus a privileged `upsert`); see the website `TRACKS/INDEX.md` for the full note.
> Only owner device-pass verification remains.

> 🔁 **2026-09-19 — R-20/R-20a shipped (fixed-speed drive, Speed strip, STEER limit;
> updater stale-cache repair; native version display; runtimeVersion appVersion policy).**
> App is now **3.2.3 / versionCode 56**, all pushed + pipelines verified. Resume point:
> `NEXT-SESSION.md` in this folder + `guide/SESSION-HANDOFF-2026-09-19-R20.md`.

> 🔁 **2026-09-27 — U-45 linker + U-47 owner rounds v1→v7 shipped. App is now
> 3.2.6 / versionCode 59 (`4f8ed03`), all pushed + pipelines verified (vitest 205/205).
> Resume point: `NEXT-SESSION.md` in this folder + `guide/SESSION-2026-09-27-U47-OWNER-ROUND.md`.
> The 09-19/09-23 notes below are historical.

Per-project tracker for the **APP + WEBSITE SYNC / UNIFICATION (2026-09-18)** effort.
Master plan + recovery: `(workspace) guide/APP-WEBSITE-SYNC-PLAN-2026-09-18.md`.

Branches: `main` (the working branch — all new work lands here; only push target) · `dev` (owner
backup **snapshot**, fast-forwarded to `main` on owner instruction 2026-09-27; it is a point-in-time
restore, NOT a mirror, so it will fall behind `main` as new work lands — re-sync it with
`git push origin main:dev` whenever the owner wants a fresh restore point).
Workflows: `ci.yml` · `ota-only.yml` · `release.yml` · `sync-version.yml`.
App root: `mobile/`. Release chain: `bump-version.mjs → gradlew assembleRelease →
upload-release.mjs → (website) sync-app-fallback.mjs`.

## Items

| ID  | Change                                                                                         | Status |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| B1  | `mobile/src/config/roboCarCatalog.ts:55` `4wd4m` label → `'4WD4M'`                             | DONE   |
| B2  | Root `README.md` + `.gitleaks.toml` header (drop stale WebView/mobile/shared/supabase.ts refs) | DONE   |
| B3  | `.github/workflows/ci.yml` triggers `[dev]` → `[main]` (+PRs to `main`)                        | DONE   |
| B4  | Parity tests (APP_VERSION vs app.json · 9-mode fixture · update.ts URLs)                       | DONE   |
| C1  | README shared-contract section                                                                 | DONE   |
| C2  | Verify `typecheck` / `test` / `doctor` green                                                   | DONE   |

## Notes

- Fully-native app; not a WebView mirror. Shared schema lives in the SIBLING website repo
  (`genumsolutions-website/supabase/schema.sql`); `mobile/supabase/` intentionally empty.
- Version single source of truth: `mobile/app.json` (version + versionCode). Mirrors:
  `src/config/site.ts` `APP_VERSION`, `package.json`, git tag. Current: **3.2.1 / 54**
  (bump `de8e595`, FIN-33 resolved — fresh APK; tag `v3.2.1` pending FIN-36).
- `bump-version.mjs` intentionally does NOT touch the website fallback anymore.
- **2026-09-18 result:** all B/C items landed on `main` (HEAD `a390b6e`). `4wd4m` display
  label aligned to `4WD4M`, CI triggers → `main`, docs refreshed to the fully-native app,
  and `mobile/src/config/parity.test.ts` now pins APP_VERSION ↔ app.json, the 9-mode
  catalogue, and the shared `app-releases` bucket URLs (62 tests + typecheck + doctor
  18/18 green).
- `.gitleaks.toml` allowlists ONLY the public anon key (ref `bkylfnlybtsujwzropru`) — the
  service-role key stays in env only. Never print secrets.
- Env copies: `mobile/.env.local`, `C:\bs\.env.local` (build mirror — `E:\` LongPaths disabled).

_Created 2026-09-18. Update status column on every change; never delete without owner OK._

**2026-09-23 · push config project-id fallback (`71f1855`).** `config/push.ts` resolved `PUSH_PROJECT_ID` ONLY from `process.env.EXPO_PUBLIC_EAS_PROJECT_ID` (unset) so push stayed permanently dormant — no device could register a `push_tokens` row even after Firebase is added. Now falls back to the `extra.eas.projectId` declared in `app.json` (`f09b820e-…`, single source of truth), via exported pure `resolvePushProjectId(env, appJson)`. New `config/push.test.ts` (3 cases). Gates: tsc clean · vitest **140/140** (137+3). Behavior-neutral JS fix — rides `ci.yml` + `ota-only.yml` (no version bump). Push delivery still blocked on Firebase (owner decision) until `google-services.json` + rebuild.

**2026-09-23 · M3 test-repair round: cartService.ts totalCount + failing unit tests.**
The two last commits (`2aa548b`/`6e48380`) added unit tests for `cartService` +
`roboCarCatalog` that were RED under the CI vitest 4.1.11: (a) two `totalCount`
tests expected a sync `number` while the fn was `async` — the uncommitted working
copy (the one modified file the owner saw) had started the fix (`async` → sync,
`cartService.ts:108`) but left the `AppContext.tsx:254/295` `await`s stale; (b) the
supabase mock swapped the whole `__createClient` return value, but the client is
constructed once at module import (`src/config/supabase.ts:37`) and cached, so the
sanitize-path test always saw `data:null` → `[]`; (c) mock call-history leaked across
tests (`.mock.calls[0]` referenced earlier tests). Fixed: completed the totalCount
change + de-awaited the callsites; the mock now exposes `maybeSingle`/`upsert` fns
driven per test; added `beforeEach(vi.clearAllMocks)`; casts typed as vitest `Mock`
(was `typeof vi.fn` → TS2339/TS2352 errors); `roboCarCatalog.test.ts` padded an
unknown-id fixture to a full `CarMode` (TS2345). Gates: `npm run typecheck` clean ·
vitest **137/137** · expo-doctor 18/18 (was 3/4 failing tests + 20+ tsc errors). Push
does NOT bump the version: rides `ci.yml` + `ota-only.yml` only (behavior-neutral JS
fix).

**2026-09-18 · R-15 (owner) — keyboard + telemetry UX fixed, UNCOMMITTED (FIN-41).**
Remote screens (landscape, webserver/telemetry): `RouterPanel` rebuilt responsive
(flex-wrap cards, no horizontal scroll, Android KeyboardAvoidingView actually enabled —
old code passed `undefined` on Android), `PidInputModal` anchored above the keyboard,
telemetry view = OLED + live readout column (no scroll, uses the space). tsc clean ·
62/62. ⚠️ Do NOT push until owner verifies on device — push auto-publishes JS OTA
(`ota-only.yml`) to every 3.2.1/54 install.

---

**2026-09-27 — state refresh.** App HEAD = **3.2.6/59** (`4f8ed03`) after U-45 Phase 2
(linker mirror) + U-47 v1→v7 (six-category Control Panel + remotes, CollectionContext,
minimal cards, cart rebuild, admin sweeps, biometric fix) — all pushed, CI + OTA green,
vitest 205/205. Resume point: `TRACKS/NEXT-SESSION.md` (top block) +
`guide/SESSION-2026-09-27-U47-OWNER-ROUND.md`. FIN-36 re-stage + tags wait on the owner
device pass.

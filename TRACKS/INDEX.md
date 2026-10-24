# genumsolutions-app TRACKS — app·website sync 2026-09-18

> ✅ **2026-10-24 (latest) — U-123 SHIPPED (JS-only → same-version OTA 3.2.7/60;
> car half = RUNSHEET records patch only): the storyboard/wireframe re-review's
> six findings, one fix each.** **1** the storyboard §1 table's swallowed
> `right (robocar)` row split back into its own row · **2** type scale made
> honest — mode 13→**12** px, speed value 11→**12** px, telemetry labels 8→**10**
> px (nothing below the scale's 9 px floor; the scale line now lists the
> telemetry tier) · **3** the settings header's `border-b` removed → **one
> divider above every group** (the doubled rule above CAR CONNECTION is gone) ·
> **4** the settings panel's scroll indicator **ON** — the below-fold Danger
> zone is discoverable on short landscape screens (Connectivity pane keeps its
> hidden one) · **5** the phone chip is information again — dead
> `onPress={() => {}}`/press-fade/a11y-button and the `shrink-0`+`flex-1`
> contradiction replaced by a plain truncating `View` (label/testID/200 px cap
> kept) · **6** stale size docs corrected (`remoteChrome.test.ts` U-121 header
> `px-4 py-2, 12 px`; storyboard §2 gains the `isRobocar` tab gate).
> **Owner extras:** RUNSHEET staleness patched (§1 heading →1.3.17, `fw`
> expectation →1.3.17, manifest → the LIVE `9bb4850…` hash verified 2026-10-24
> 05:45 UTC, boot-log name →1.3.17, header tick order → **newest round first**,
> previously omitting U-121/Q1/U-120 rows) + new bench row **U-123-4** (640 px,
> BOTH disconnect chips — the ⭐ watch row: static math says the tabs may clip).
> New pins: `remoteChrome.test.ts` describe **U-123** (5 rules). Gates: app tsc
> 0 · vitest **901/901** (60 files) · prettier clean; car (records-only, re-run
> anyway) syntax 9/9 · contract 0 · webpage-js PASS · mutate **137/137**. Device
> rows: `mobile/TESTING.md` **U-123-1..4** (unticked, F-61). Session note:
> `TRACKS/SESSION-2026-10-24-U123.md`.

> ✅ **2026-10-24 (latest) — U-122 SHIPPED (JS-only → same-version OTA 3.2.7/60; NO car
> change): full audit of BOTH repos + the Remote screen's layout, hierarchy & settings.**
> Audit: car repo **clean** (every removed-feature hit is intentional NVS cleanup or a
> historical record); app findings were all Remote-layout debt and all fixed — the Webpage
> toggle's comment sitting above the FACTORY-RESET block, the unused `setThemeMode` destructure,
> the Connectivity section's doubled top margin (`mt-2` inside the host's `padding:10` — the
> "sections got increased space twice" report), the cramped `InlineMessage` box (10 px type in a
> 12 px line). Layout: the shell is now inset-driven on ALL four sides (landscape cameras sit on
> the SIDE edge; 12 px floor) and both bars share one left edge · the gear 56→44 px (hierarchy) ·
> the four tabs are ONE segmented `tablist` strip (active filled) · the settings dropdown is
> inset-anchored with an ✕ close and three `SettingsGroup` sections — **Car connection → Driving →
> Danger zone LAST** (factory reset no longer sits between routine settings), labels 11 px/subs
> 10 px. Arrangement verified against a measured wireframe rendered in headless Chrome
> (`TRACKS/remote-wireframe-2026-10-24.png`). All U-113/U-121 pins held. Gates: app tsc 0 ·
> vitest **896/896** (60 files) · prettier clean. Device rows: `mobile/TESTING.md` **U-122-1..4**
> (unticked, F-61). Session note: `TRACKS/SESSION-2026-10-24-U122.md`.

> ✅ **2026-10-24 (latest) — U-121 ROUND 2 SHIPPED (JS-only → same-version OTA 3.2.7/60; car FW
> **1.3.17**): the owner's snag list, one phase per item.** **A2** the phone's network is on the
> Remote's first bar **ONLY** — the `conn-phone-network` "This phone" box is deleted from the
> Connectivity panel (it was the duplicate `…name hidden` the owner saw), the dangling
> `<IotEntryCard>` usage is gone (it was the `TS2304` that left `tsc` RED on resume), and the
> duplicated merged-row comment + `{" "}` residue went with it · **B2** the **Car network** card
> finally carries both facts its P8 comment had promised — `The car is on` (editable,
> auto-filled `telemetry.ssid` → configured → the owner's answer) and **Control address**
> (read-only `(onOwnHotspot ? null : reportedIp) ?? DEFAULT_AP_IP`), via a new per-car pref
> **`carSsidAnswer`** that rides the `persistPrefs` base because `deviceMemory.write` REPLACES
> the record (with `carNetworkHint` for the same reason) · **C2** the connectivity residue sweep
> (left "Added networks" is display-only — it was a second set of tap-to-switch buttons for the
> right pane's own list; stale IoT/list-hiding comments and a stray `{" "}` removed) + the new
> **`storyboard.md`** — the Remote screen's region-by-region source of truth, single-copy map and
> do-not-re-add list (fleet convention: shape recorded first, code renders it, tests pin it).
> **Car E2 (same report's firmware half):** _"the car resets again and again whenever i try to
> connect the wifi from the app"_ — the switch/give-up step machines were the last UNGATED radio
> path, now gated by `switchRadioMayRun()` (defer below 32000 B, **abandon** after 4 s with no
> radio call) → **FW 1.3.17**, contract rule `switch-heap` + M137–M143; also fixed two
> PRE-EXISTING reds (webpage-js transport-default checks; the undetected **M136**). Gates: app
> tsc 0 · vitest **896/896** (60 files) · prettier clean; car syntax 9/9 · contract 0 ·
> webpage-js 0 · mutate **137/137**. Device rows: `mobile/TESTING.md` **U-121-A1..C2** + car
> `TRACKS/DEVICE-TESTS.md` **U-121-E · U-121-E2** (all unticked, F-61). Session note:
> `TRACKS/SESSION-2026-10-23-U121.md` (2026-10-24 section). Commits: app `2c884ff` → `e4d3d4a`
> → `34e9f9e` (+ records); car `088c46a` → `72abcbd`. **⚠ The car is still on 1.3.11 — 1.3.17
> must be FLASHED before any of its rows can be ticked.**

> ✅ **2026-10-22/23 (latest) — U-120 SHIPPED (JS-only → same-version OTA 3.2.7/60; car FW
> **1.3.15**): Q1–Q3 close-out + owner list B in five phases, each pushed mid-phase.** **Q1**
> firmware boot-hop stopped (`boot_autojoin` default OFF in 1.3.15; the app's smart-link is the
> only router-joiner) · **Q2/Q3** pins (telemetry-first drop on narrow phones · both-links
> fan-out, `chosenRadio: null`) · **B** the webpage toggle's `WIFICFG;WIFI;PAGE;…` finally
> REACHES its handler (car `;WIFI`-prefix swallow fixed on the car side; app PAGE-reply branch
> precedes the generic WIFI branch) · **C** reconnecting is NEVER automatic — SPP silent
> backoff + Wi-Fi quiet re-dial DELETED; ONE dialog names the METHOD (Bluetooth/Wi-Fi) and
> Reconnect routes through it, yes-only, Cancel marks the link user-closed · **D** no dummy
> "Paired car" row in the paired list (the old guard tested `d.address` — always a MAC — and
> emptied the list; now filtered by NAME) · by-name **car-network selector beside the connect
> screen's broadcast-IP field** (car's current network marked "· car"; its reported lease
> prefills the field; `ROUTERS;USE` over a live link otherwise) · **"This phone" network row
> on the Connect screen before any link** · **E** auto-join says AND does **"last used router"**
> (Remote settings + car profile card + smart-link toast; `pickBestRouter` recency-only; the
> strength-scan ask, the 6 s wait and the scan-early fire are GONE) + settings/connectivity
> audit + cleansing. Gates: app tsc 0 · vitest **882/882** (59 files) · prettier clean; car
> syntax 9/9 · contract 0 (`boot-hop-off`, `page-state`) · webpage-js PASS · mutate
> **123/123**. Device rows: `mobile/TESTING.md` **U-120-C1..E3** + car
> `TRACKS/DEVICE-TESTS.md` **Q1-1 · Q1-2 · U-120-B** (all unticked, F-61). Session note:
> `TRACKS/SESSION-2026-10-22-U120.md`. Commits: app `8a66ddc` → `8a034e5` → `1a2a17b` →
> `af0c56b` → `f9e61f1` (+ records); car `965b909`/`62c0b31` → `ff96ca5`/`7a4486d`.

> ✅ **2026-10-20 (latest) — U-117/U-118/U-119 SHIPPED (JS-only → same-version OTA 3.2.7/60):
> the WEBPAGE TOGGLE NOW TELLS THE TRUTH** (`page_on`/`;PAGE=` parsed, adopted
> change-guarded, queried on link-up, `WIFICFG` reply persists inside its guard, the
> per-render mirror no longer nulls the page slot, switch disabled while offline, and the
> inverted **`pageOff` → `pageOn`** rename end to end) · **the deck's reconnect card drops
> the last-reset RECORD** (owner: _"remove that"_ — one card left, Reconnect + Cancel; a
> restart survives only as a plain cause sentence; Cancel clears it; the record still leads
> Tools → Diagnostics) · **"This phone" network row** in the Connectivity panel (pure
> `formatPhoneNetwork`: Wi-Fi · SSID / hidden / Cellular / No network; deck chip stays gone)
> · **cleansing**: six dead exports removed. Car twin: `;PAGE=` on STATE + contract rule
> `page-state` + M123-M126, **FW 1.3.14 (UNFLASHED)**. Gates: tsc 0 · vitest **843/843** ·
> prettier clean; car contract 0 · webpage-js PASS · syntax 9/9 · **mutate 120/120**.
> Device rows: `mobile/TESTING.md` **U-117-1..4 · U-118-1..4 · U-119-1** (all unticked,
> F-61). Session note (mid-session insurance): `TRACKS/SESSION-2026-10-20-U117-U118.md`.

> ✅ **2026-10-13 (latest) — U-105 SHIPPED (JS-only → same-version OTA 3.2.7/60, UNPUSHED
> pending commit): ONE fleet own-hotspot `4WD4MCar_WiFi` (donor `WirelessCar_Wifi` + old
> `4WDCar_Wifi` purged); Parallel + Hotspot power-save (APSAVE) settings REMOVED, replaced by
> the car's **Wi-Fi / Bluetooth / Boot auto-join** toggles (`WIFICFG;WIFI|BT|AUTOJOIN`, NVS
> `t_wifi`/`t_bt`/`boot_autojoin`, cloud `wifi_enabled`/`bt_enabled`/`boot_autojoin`); the
> one-active-link teardown is GONE (both transports stay live by default); delete-a-network
> now STAYS deleted (car `ROUTERS;DEL` case-insensitive). Gates: tsc 0 · vitest **688/688** ·
> prettier clean. Car firmware **1.3.5** gates green — **UNFLASHED** (the SSID rename needs the
> flash). Device rows: `mobile/TESTING.md` **U-105-0..8** + car `TRACKS/DEVICE-TESTS.md`
> **U-105-1..8**. An `4WDCar_Wifi`/`WirelessCar_Wifi` mention below an entry = that ROUND's
> history, never current state.

> ✅ **2026-09-30 (latest) — DECKS ②+③ SHIPPED: ALL FIVE CATEGORY DECKS + KIND HEADERS
> (JS-only → same-version OTA 3.2.7/60, `c40e3be` + `f05cdaf`).** Owner approved the pilot →
> SmartFarm/SmartCity/SmartDustbin/Handheld decks landed (live relay switches + honest
> "Ready for firmware" placeholders; SensorGrid fallback retired) and the Control Panel pill
> row gained two kind headers ("Devices that drive" / "Devices that monitor & switch") —
> same 7 pills, same order, static catalog data. Tile labels disambiguated to keep the
> parity test's zero-leakage rule. Gates: tsc 0 · vitest **317/317** · prettier clean.
> Device rows: **U-57-1..4**. Per-category decks round COMPLETE.

> ✅ **2026-09-30 — PER-CATEGORY DECKS STEP ① SHIPPED: Smart Home deck pilot
> (JS-only → same-version OTA 3.2.7/60, `9570187`).** The approved plan
> (`guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`) started: deck kit (`decks/deckkit.ts`
> manifests + `decks/shared.tsx` chrome) + **SmartHomeDeck** — the Remote window's Smart Home
> category renders ONLY its own tiles (Light/Fan/Socket live relay wall, live
> Temperature/Humidity, honest "Ready for firmware" Motion/IR chip), never the shared
> SensorGrid; farm/city/dustbin/handheld wait for owner screenshot approval (step ②);
> robocar + drones untouched. Parity test pins zero cross-category tile-label overlap + a
> step-② tripwire. Gates: tsc 0 · vitest **313/313** · prettier clean. Device rows:
> **U-56-1..4**. Also this session: **website CI repaired** (`a8f72f7` — TS2532 in
> car-profiles tests had failed every sync-app-fallback run; now green).

> ✅ **2026-09-30 (later) — R4-7 SHIPPED: USER PREFERENCES HUB (JS-only → same-version OTA
> 3.2.7/60).** Menu "Robot Settings / Robot preferences" → **"User Settings / User
> preferences"**; the screen is now the user hub — **My devices** (every car ever connected via
> ANY transport, listed once: union of car_profiles + local deviceMemory + last-device spill;
> per device Set name · Auto-join · Forget — forget never touches the car) + the existing robot
> profiles. New `deviceProfileRegistryService.ts` (union + actions + offline-first
> pushLocalDevicesToCloud; no new table — owner rule). Hub writes register device keys so the
> registry never misses one. Gates: tsc 0 · vitest **305/305** · prettier clean. Device rows:
> **U-55-1..6**. R4-1..R4-7 now ALL shipped — next queued design round: per-category decks.

> ✅ **2026-09-30 — ROUND 4 CORE SHIPPED (R4-1b · R4-4 · R4-5, JS-only → same-version OTA
> 3.2.7/60): AP-vs-router banner wording follows the method (R4-1b) · TransportPicker reports
> the chosen method and the home-router (STA) method hosts the SAME RouterPanel the remote's
> webserver mode has, with a per-row Edit (re-ADD upsert) — AP/BT never show it (R4-4) · the
> U-52 `car_profiles` engine (NOT a second table — the broken device_profiles WIP was
> discarded, F-49) now syncs the last router SSID and restores it on adopt: recency seed +
> STA address prefill (R4-5). Gates: tsc 0 · vitest **296/296** · prettier clean. Owner device
> round: `mobile/TESTING.md` **U-54-1..6**. Next queued: R4-7 (User preferences hub).
> Resume: `NEXT-SESSION.md` here.

> 🔁 **2026-09-29 SESSION CLOSE — round 4 QUEUED (owner's last message of the session), nothing
> built yet.** Owner asks: ① connection-method-aware panel — on the car-AP WiFi link show the
> CAR's AP truth (name + dBm), never home-router rows; hide sections unrelated to the current
> method; ② lock the connection-methods dropdown (and similar sections) while connected;
> ③ unlock the home-router (STA) method; ④ router-profile add/edit/delete with app ↔ car ↔ DB
> sync (car is source of truth; passwords never leave car/phone); ⑤ car-side persistence of
> everything the user changes (profile, settings, presets) via the U-52 car_profiles engine;
> ⑥ wifi-diagnostics UX: match the deck-kit family + auto-collapse when the run finishes.
> Broken into **R4-1..R4-6** with build notes in `NEXT-SESSION.md` §PLANNED-B. ALSO planned:
> per-category decks per `guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md` (approved, not built).
> ⚠️ Next AI: read `NEXT-SESSION.md` §continuity FIRST — verify against git/sed, tool echoes
> were unreliable late this session. Released this session: car-profiles round (published,
> manifest `648ed6a…`) + Control Panel round 3 F-46/F-47/F-48 (manifest `f890a2e…`), 3.2.7/60
> unchanged, no APK. Owner device rows open: U-51, U-52, U-53.

> ✅ **2026-09-29 (latest) — CONTROL PANEL ROUND 3 (`2a8b406`→`f890a2e`, three fixes, JS-only →
> same-version OTA 3.2.7/60, run `36593994243` green): false `statusCallbacks of undefined`
> connect error killed (F-46 — adapters passed service methods DETACHED, `this` was undefined;
> direct hub paths always bound, which is why the car drove fine anyway) · ConnectionBanner rows
> keep body text INSIDE the text column (F-48 — portrait split the Car / Network lines into
> crushed columns; landscape hid it) · disconnect confirm centers on the PHONE (F-47 — it
> rendered inside the ScrollView, so inset-0 covered the page). Gates: tsc 0 · vitest 292/292 ·
> prettier clean. Owner device round: `mobile/TESTING.md` **U-53-1..4** (U-52 + U-51 still
> open). Queued NEXT design round: re-organize the Control Panel per project KIND (robo cars,
> smart home, city, …). Resume: `NEXT-SESSION.md` here.

> ✅ **2026-09-29 (latest) — CAR PROFILES EVERYWHERE (`fb7d1c3`→`a40be3d`, JS-only → same-version
> OTA 3.2.7/60): `car_profiles` table APPLIED LIVE (probe `200 []`) · app sync engine wired
> (pull-on-link / push-on-save, last-saved-wins; was dead code) · Car Profile card elaborated
> (drive readout + sync badge) · website `/api/user/car-profiles` + account Car Profiles panel.
> F-44 (persist base must carry every field) · F-45 (a committed migration is not applied until
> the live API proves it). Gates: mobile 292/292 · website 164/164. Owner device round:
> `mobile/TESTING.md` **U-52-1..5** (+ U-51-1..5 still open). Resume: `NEXT-SESSION.md` here.

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
  `src/config/site.ts` `APP_VERSION`, `package.json` (+ `package-lock.json`), git tag.
  Current: **3.2.7 / versionCode 60** (bump `5c993570`, U-49). Every JS-only round since
  ships as a same-version OTA (F-32) — no further bump until a native rebuild.
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

**2026-10-15 · U-113 P1 — the dead mode-rotate button fixed (3.2.7/60, JS-only OTA,
version UNCHANGED).** Owner issue 11 of the 14-issue list (plan:
`TRACKS/PLAN-2026-10-15-dual-link-and-remote-ux.md`). Root cause: `cycleMode` walked the full
`REMOTE_MODE_ORDER` per R-10 and sent the next token — but the 4WD4M removed
`ESP_SER`/`ESP_CLI` in U-79 (absent from CAPS = GONE, U-81), so the car answered
`NACK;E=UNKNOWN_MODE` and `handleNack` rolled the pick back to 4WD4M on every tap. Fix: new
pure `nextCyclableToken(token, isUnavailable)` in `roboCarCatalog.ts`; `cycleMode` skips only
`modeAvailStatus(...) === "GONE"` (WIP/CS stay cyclable — R-10 intact). Tests: +6 catalog
rules + new F-83 source-wiring pin `components/tools/cycleModeGone.test.ts` (mutate-proven
both ways). Gates: tsc 0 · vitest **701/701** (45 files) · prettier clean. Device row
U-113-1 pending owner bench pass. Next: P2 (Remote chrome rebuild).

**2026-10-19 · P11 — Webpage toggle (U-116); app only, JS-only OTA 3.2.7/60 unchanged.**

Owner: add an independent "Webpage view" on/off switch that mutes the car's built-in
web page server (:80) without touching the Wi-Fi / Bluetooth transport layer or Bluetooth —
i.e. "wifi on/off AND webpage on/off" both present, both work.

Implementation (app `mobile/`):

- `mobile/src/components/tools/useControlHub.ts` — new `pageOff` state + `setPageOff`
  callback; `transportToggleRef`, `toggleCommitRef` and `toggleChangeProtected` extended
  with `pageOff`; `setPageOff` sends `WIFICFG;WIFI;PAGE;ON|OFF` and persists the app
  device-prefs copy.
- `mobile/src/components/tools/types.ts` — `pageOff?: boolean` added to `DevicePrefs`.
- `mobile/src/screens/RemoteControlScreen.tsx` — "Webpage view" Switch in the Remote
  settings panel (`hub.pageOff` / `hub.setPageOff`).
- Tests: `npm run typecheck` clean; `npm test` 813/821 (8 pre-existing failures in
  `connectivityResponsiveness.test.ts` + 2 other files, unrelated to this change).

Gates: `tsc --noEmit` 0 · `npm test` (see failures above). Version stays **3.2.7 / versionCode 60** — JS-only, ships on the OTA channel.

Commit:** `6ec2887`. Pushed to `main` + `backup` on all three repos (app, website, car).

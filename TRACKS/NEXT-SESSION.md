# NEXT SESSION — genumsolutions-app (2026-09-30: round 4 complete incl. R4-7; current release 3.2.7/60)

**✅ SHIPPED 2026-09-30 (latest) — DECKS STEPS ②+③: ALL FIVE CATEGORY DECKS + KIND HEADERS,
JS-only → same-version OTA 3.2.7/60 (`c40e3be` + `f05cdaf`).** Owner approved the Smart Home
pilot screenshot → ② SmartFarmDeck (Pump Room/Solenoid Valve live relays, Soil Wetness gauge,
Soil Temp, honest "Ready for firmware" Irrigation Plan), SmartCityDeck (Street Lamps/Parking
Slots relays, AQ (ppm) gauge, Daylight %), SmartDustbinDeck (Fill % gauge, Lid Open/Compactor
Run relays, Last Empty placeholder), HandheldDeck (Battery %, RSSI (dBm), Ch1/Ch2 relays,
throttle-curve placeholder) — RemoteControlScreen maps slug→deck via an IIFE switch; the
shared SensorGrid fallback is FULLY RETIRED. ③ ToolsScreen pill row grouped under two static
kind headers (KIND_GROUPS in project-catalog.ts): "Devices that drive" / "Devices that monitor
& switch" — same 7 pills, same order, nothing merges (owner decision ①). Tile labels were
disambiguated (Pump→Pump Room, Solenoid→Solenoid Valve, Soil Moisture→Soil Wetness, Schedule→
Irrigation Plan, Street Light→Street Lamps, Parking→Parking Slots, Air Quality→AQ (ppm),
Ambient Light→Daylight %, Fill Level→Fill %, Lid→Lid Open, Compactor→Compactor Run, Last
Emptied→Last Empty, Battery→Battery %, Signal (RSSI)→RSSI (dBm)) so the parity test's
pairwise-disjoint rule holds across shipped labels AND the reserved vocabulary. Gates: tsc 0
· vitest **317/317** (8 parity + 4 kind-group tests) · prettier clean. Device rows:
`mobile/TESTING.md` **U-57-1..4**. Per-category decks round COMPLETE (steps ①②③ done) —
remaining: owner device passes (U-51..U-57) + FIN-36 re-stage.

**✅ SHIPPED 2026-09-30 (latest) — PER-CATEGORY DECKS STEP ①: Smart Home deck pilot,
JS-only → same-version OTA 3.2.7/60 (`9570187`).** The approved plan
(`guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`) is now started: new
`components/tools/decks/` — `deckkit.ts` (pure-TS per-category tile manifests + reserved
step-② vocab + `hasDeck()` routing helper + PILOT_DECK_SLUGS tripwire) and `shared.tsx`
(DeckCard/DeckSwitch/DeckValue/DeckGauge/DeckPlanned/DeckGrid chrome, robocar-card family
styling). RemoteControlScreen's non-robocar branch renders the **SmartHomeDeck** for any
category with a manifest — Smart Home shows ONLY its own tiles: Light/Fan/Socket relay wall
(LIVE `OUT<i>:n` writes via the hub's toggleRelay, canControl-gated), Temperature/Humidity
readouts (live sensorData placeholders, U-47 pattern), and an honest **"Ready for firmware"
Motion/IR tile** (disabled, never fakes success). Farm/City/Dustbin/Handheld stay on the
shared SensorGrid until owner screenshot approval (step ②); robocar + drones untouched
(gold standard). Parity test `deckkit.test.ts` (8) pins zero cross-category tile-label
overlap (incl. the reserved vocab) and the step-② tripwire. Gates: tsc 0 · vitest
**313/313** · prettier clean. Device rows: `mobile/TESTING.md` **U-56-1..4**. REMAINING:
step ② (four decks after owner approval) → step ③ (ToolsScreen kind headers).

**✅ FIXED 2026-09-30 — WEBSITE CI REPAIR (`a8f72f7` + ledger `22b14b3`, website repo).**
The owner reported red runs: `tests/car-profiles.test.ts` indexed `body.profiles[0]`
without the optional chain → TS2532 under `noUncheckedIndexedAccess` → ci.yml red AND every
scheduled sync-app-fallback run failed its typecheck gate (no fallback auto-commit could
land while red). One-line optional-chain fix; website gates: tsc 0 · vitest **164/164** ·
prettier clean · CI ✓ (36700664286) · Sync app fallback ✓ (36700664409). App repo was and
stayed fully green throughout.

**✅ SHIPPED 2026-09-30 (later) — R4-7: USER PREFERENCES HUB, JS-only → same-version OTA
3.2.7/60.** Menu group "Robot Settings" → **"User Settings"**, item "Robot preferences" →
**"User preferences"**; route `RobotPreferences` → `UserPreferences` (screen renamed via git mv,
robotSettingsService untouched). The screen is now the USER hub: ① **My devices** — every
car/device ever connected through ANY transport, listed ONCE (union of cloud `car_profiles` +
local deviceMemory records + the last-device spill, keyed by the stable profile key
fw:<id> | MAC | wifi:<identity>; mirrored rows flagged; local-only rows badged "this phone");
per device **Set name · Auto-join on/off · Forget** (forget = app memory + cloud row, NEVER the
car). ② **Robot profiles** — the existing robot_user_settings scope, unchanged. New
`deviceProfileRegistryService.ts` (union + actions + `pushLocalDevicesToCloud` offline-first
spill: locally-known devices land in the DB automatically once online; factory-fresh stubs are
never pushed). Hub writes now call `rememberDeviceKey()` so the registry index never misses a
device. No new table (owner rule) — car_profiles already stores everything; F-45 probe rule
not triggered. 9 new registry tests (vitest **305/305**). Device rows: TESTING.md
**U-55-1..6**. REMAINING round-4 item: none in code — R4-1..R4-7 all shipped; next queued
design round = per-category decks (PLAN-2026-09-29-CONTROL-PANEL-KINDS.md).

**✅ SHIPPED 2026-09-30 — ROUND 4 CORE (R4-1b · R4-4 · R4-5), JS-only → same-version OTA
3.2.7/60, one concern per commit.** ① R4-1b: ConnectionBanner's Signal row is method-flavored
— "Router signal · car to your router" on a home-router link, "Car AP signal · phone to the
car's hotspot" on an AP link (the dBm is always the car's own radio; only the wording follows
the method — owner: "when the car is the AP, show that, not home-router dBm"). ② R4-4:
TransportPicker publishes the chosen method via `onPickedChange`; ToolsScreen hosts the
**Home router settings** section ONLY for `wifi-sta-ws` — the same RouterPanel the remote's
webserver mode uses, plus a per-row **Edit** (re-ADD upsert, T-48a) — AP/BT never see it. ③
R4-5: the WIP `deviceProfileService.ts` (broken: duplicate export, dead effect guard, second
`device_profiles` table = data-mixing risk) was DISCARDED; the U-52 `car_profiles` engine now
also syncs `last_wifi_ssid` + restores it on adopt (recency seed + STA address prefill).
WIP commit rule violated by the leftover WIP — see FAILSAFES **F-49**. Gates: tsc 0 · vitest
**296/296** · prettier clean. Device rows: `mobile/TESTING.md` **U-54-1..6**. Next queued:
**R4-7** (User preferences hub; rides the existing engine).

**PLANNED (owner decisions captured 2026-09-29) — CONTROL PANEL PER-CATEGORY DECKS, UI-first.
Plan: `guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`.** Owner: the 7 categories stay SEPARATE
(kinds are visual labels only) · robocar deck untouched (gold standard) · every OTHER category
gets its OWN landscape-only deck in the Remote window showing only its own things (never the
shared SensorGrid fallback) · build the full UI/display now, operations later. Design covers:
kind headers (Vehicles & Controllers / Stations & Environments), five dedicated decks
(SmartHome/Farm/City/Dustbin/Handheld) on a shared deck kit, honest "Ready for firmware" chips
for not-yet-wired controls, parity tests pinning zero cross-category leakage. Rollout: deck kit
+ SmartHomeDeck pilot → owner screenshot approval → remaining decks → kind headers. Owner open
checks in plan §6 (label wording, tile defaults, chip wording). **Step ① SHIPPED 2026-09-30
(see top banner) — steps ②–③ remain.**
**2026-09-29 (LATEST) — CONTROL PANEL ROUND 3: FALSE CONNECT ERROR KILLED, PORTRAIT BANNER
FIXED, DIALOG CENTERS ON THE PHONE (`2a8b406` `ca5822d` `f890a2e`, JS-only → same-version OTA
3.2.7/60, run `36593994243` green).** Owner: red `Cannot read properties of undefined (reading
'statusCallbacks')` under the verified line while the car answered fine on BT + WiFi; the
Linked / "Network on the car · own access point" lines broken in portrait only; disconnect
dialog centered on the page not the phone. ① F-46: `adapters.ts` passed `onStatus` as a bare
method reference — detached `this` threw on every linkManager adopt/activate subscription (the
direct hub paths always bound, which is why driving worked); arrow wrappers now bind the call.
② F-48: ConnectionBanner `Row` rendered body text as a second flex column — portrait crushed
the long lines, landscape masked it; body text lives in the text column, signal bars are a
`trailing`. ③ F-47: the disconnect confirm rendered INSIDE the ScrollView so `inset-0` covered
the scrollable PAGE; it is now a sibling of the ScrollView under a screen-wide root.
Gates: tsc 0 · vitest 292/292 · prettier clean. F-46 regression test skipped (shared-mock
typing made it brittle) — rule recorded in FAILSAFES F-46. Owner also asked for the Control
Panel re-organized per project kind (robo cars, smart home, city…) — NOT started; queued as
the next design round after the device passes. Device rows: `mobile/TESTING.md` **U-53-1..4**.

**2026-09-29 (LATEST) — CAR PROFILES EVERYWHERE: DB APPLIED LIVE, APP SYNC-ON-CONNECT WIRED,
WEBSITE ACCOUNT SURFACE (`fb7d1c3` `a2e08cb` `a40be3d`, ALL JS-ONLY → SAME-VERSION OTA
3.2.7/60).** Owner: "car profiles and their data to the database from all app and websites… gets
sync with the device as soon as everything gets connected… save the last save things… ready for
4wd4m, 2wd1m, selfbalance… make note of this session for security." ① The `car_profiles` table
was committed rounds ago but **never applied** — live probe PGRST205; ran the project's own
`npm run db:apply` → probe `200 []` (owner RLS verified). ② The app's cloud profile service was
**dead code** — now wired: `persistPrefs` stamps `savedAt` + mirrors every save to the user's row;
on profile-key focus the hub pulls and ADOPTS the cloud row when newer (or local factory-fresh),
else PUSHES the newer local save; merge helpers sanitize + clamp (speed 100..255, servo/steer
0..180, trim ±100). F-44: narrow persist patches were wiping `wifiHistory`/`fullscreen` — fixed
(base carries them forward). ③ Car Profile card elaborated: last-saved drive readout (mode name,
speed n/255, steer°, ±trim, control style), sync badge (synced · restored · saved-on-phone),
sign-in hint. ④ Website: `/api/user/car-profiles` GET/PATCH/DELETE + account **Car Profiles**
panel (rename/remove; web never writes drive settings). Security notes in `GUIDE.md` session log

- FAILSAFES **F-44/F-45**. Gates: mobile tsc 0 · vitest **292/292**; website tsc 0 · lint 0 ·
  vitest **164/164**. **Next: owner device round = `mobile/TESTING.md` U-52-1..5 (sign-in → link →
  synced badge → second-device restore → web rename/remove) + U-51-1..5 from the earlier round
  still pending.**

**2026-09-29 — CONTROL PANEL SNAG ROUND 2: SIX FIXES COMMITTED (`cc8f671`→`fdb0941`), ONE
CONCERN PER COMMIT, ALL JS-ONLY → SAME-VERSION OTA (3.2.7/60 stays, no APK).** Owner snags
fixed: ① "Every way the car can be controlled" teaching card removed (`cc8f671`,
`ConnectionsTeaching.tsx` deleted — the per-method ⓘ windows carry that content; stale U-50
rows superseded). ② SPP false-error killed (F-40, `7f3420f`): the bridge no longer throws
"That car is no longer in the scan list. Rescan." — it resolves the scanned device when still
listed, else dials directly by MAC with the scanned name (`name?` added to
`TransportConnectOptions`). ③ Primary-method gate (F-41, `6034eaf`): only **SPP + Car access
point** selectable; the other six rows dimmed **"Coming Soon"**, dial-proof, ⓘ windows intact;
STA/home-router unlocks after SPP + AP device-verify. ④ Speed fixed (F-42, `90b29ca`): the
telemetry STATE echo no longer overwrites the user's speed edit (change-guarded via `speedRef`,
range-clamped 100..255, NAV-aware); strips linear 100→255, `DriveControls` imports `SPEED_MIN`
from the shared protocol — shown = sent `SPD<n>`. ⑤ FAB rotation fix (F-43, `a967513`):
persisted slot re-clamped into the visible window on every `useWindowDimensions()` change — a
portrait-dragged slot can no longer park the FAB off-screen in landscape. ⑥ Control Panel
polish (`fdb0941`): hub connect errors render with the connection feedback cluster above the
picker; About spacing matches section rhythm. Gates: tsc 0 · vitest **285/285** · prettier +
lint-hook clean. `app.json` untouched. **Next: OTA Only run green (release-guard checked first:
live manifest 3.2.7/60 == `app.json`) → owner device round = `mobile/TESTING.md` U-51-1..5**
(paired-car connect · Coming-Soon rows · speed holds mid-drive · FAB survives rotation · error
placement). U-49/U-50 device rows still open.

**Previous round — U-48 FINAL SNAG ROUND: COMMITTED (`d148457`), PUSHED, CI GREEN, OTA PUBLISHED. One owner
action left — the device pass.**

1. ~~`supabase functions deploy site-content`~~ — **DONE.** Deployed to v4 and verified live
   (`get` no auth → 200, `upsert` no auth → 401, `upsert` bad token → 401), so the app's admin
   "save site content" works end to end. **Must use `--no-verify-jwt`** (public `get` + privileged
   `upsert` in one function; a plain deploy resets `verify_jwt` to true and breaks the app's
   unauthenticated hero read). Full note in the website `TRACKS/INDEX.md`.
   `payment-khalti` is committed but **intentionally NOT deployed** — the owner owns the payment
   side, so it was left alone on purpose; it must also keep `--no-verify-jwt`.
2. ~~Review + commit + push both repos~~ — **DONE.** app `d148457`, website `9b23f8b`, both on
   `main`, both CI green, no version bump (JS-only).
3. `ota-only.yml` auto-fired on the `mobile/src/**` push and **published the bundle** (run
   36334108319, 2m40s). `release.json` shows `"OTA — Short update (d148457…)"`, `updated_at`
   2026-09-27T16:43Z. App stays **3.2.6 / 59** — no APK rebuild needed.
4. **Owner device pass** (the only remaining item): pull-to-refresh on Home/Printing/Tools ·
   double-tap on "Add to build list" adds exactly once · cart "+" lands on the right quantity ·
   admin site-content save succeeds.
   Detail: `guide/PLAN-2026-09-27-U48-FINAL-SNAGS.md` §6–§7 + `guide/SESSION-2026-09-27-U48-FINAL-SNAGS.md`.
   Gates at handoff: app tsc 0 · vitest 205/205 · prettier clean · web tsc/lint/vitest 151/151/build.

**DONE 2026-09-27 — U-45 PHASE 2 APP LINKER + U-47 OWNER ROUNDS v1→v7 (app `fb3d118` → `4f8ed03`; all pushed).**
Full logs: `guide/SESSION-2026-09-27-U47-OWNER-ROUND.md` (per-version detail + do-not-regress list)

- `guide/NEXT-SESSION-2026-09-27.md` (carry-over queue). Shipped app-side: project↔component linker
  mirror (detail strips + ProjectTab linker card via the `save_project_components` RPC, vitest 203/203
  at that point); U-47 six-category Control Panel + remotes (Smart Dustbin Fill/Lid, Remote Controller
  RSSI — placeholder sensorData until a real firmware protocol exists), app-wide CollectionContext +
  collectionService hearts, minimal square ProductCards + `productMedia` fallback imagery, shared
  `applyComponentsScope` (+ regression tests), admin single-row tabs + swipe-sync guard + overflow
  sweeps, home snap carousels + electronic-only Shop strip, PrintingScreen store + filter stack,
  CartHeader + cart web-parity rebuild, menu cleanup, biometric re-arm guard + auto-heal (v7) with the
  Security switch always rendered for staff. Gates every round: tsc 0 · vitest 205/205 · prettier ✓.
  Version 3.2.5→3.2.6 (58→59) bump pushed via release.yml.

**DEVICE-VERIFY (owner — the FIN-36 gate; pairs with the web menu checks):** reopen the app ×2 on
3.2.6/59: ① biometric toggle switchable + no card deflect on resume; ② admin tabs single-row, no
flicker; ③ minimal cards + hearts → profile collection sync; ④ six-category Projects filter;
⑤ Smart Dustbin / Remote Controller remote windows render; ⑥ cart header + qty controls at 320–360px;
⑦ bottom nav 4 tabs. On PASS → re-stage FIN-36 targets to the 3.2.6/59 release chain
(`guide/FIN-36-TAGS.sh --dry-run`) → cut tags.

**DONE 2026-09-25 — PERF BATCH (JS-only → rides the next OTA, no version bump).**
Queued at the end of U-31 and executed after the U-37 mirror:

- **HomeScreen progressive render** (`screens/HomeScreen.tsx`): the old render
  gated EVERY band behind a full-screen spinner until the SLOWEST of four
  fetches settled (services + catalog + site content + programs). The hero now
  paints instantly on the bundled fallbacks; services / featured products /
  programs+curriculum+pilot bands each appear as their OWN promise resolves
  (`servicesReady` / `featuredReady` / `programsReady`), with one small inline
  spinner while a band is in flight. One slow read can no longer blank the
  whole home screen. Bands sharing one read (curriculum + training + pilot)
  gate together on `programsReady` — the bundled fallbacks mean they are
  always populated by the time it flips.
- **CartScreen focus re-resolve dedupe** (`screens/CartScreen.tsx`):
  `resolveCart` still runs on catalog change / qty edit / focus, but the
  `setLines` update is skipped when the resolved lines are identical
  (productId+quantity sequence). Tab swipes through the pager previously
  re-rendered the whole list on every focus with zero changes.
- **Single launch OTA check** (`context/AppContext.tsx`):
  `runLaunchUpdateCheck` is now a one-flight-per-launch shared promise. The
  effect re-fires on every AppContext remount (error-boundary recoveries,
  dev StrictMode double-invoke) and each run hits BOTH the OTA server and
  the release manifest — remounts now await the same flight (one network
  check per launch, not N).
- **Memoized ProductCard** (`components/ProductCard.tsx`): wrapped in
  `React.memo` (primitives-only props → default shallow compare). The Shop
  FlatList re-renders on every search keystroke, page flip, and focus
  refresh; individual cards now skip re-render unless their product or
  layout props changed. Used by Shop/Projects/Home/related/recently-viewed
  rows, so all of them benefit.

Gates: app tsc 0 · vitest **189/189** · prettier clean on all four touched
files. No behavior changes beyond render timing; no version bump.
**COMMITTED + PUSHED 2026-09-25 (`f569b0a`)** — CI ✓ (run 36155292738) ·
OTA Only ✓ (run 36155292713, bundle **published**, update group
`f50d69aa-d955-4b71-aa92-fe4867f9e935`) → device-verify checklist below.

**DEVICE-VERIFY (owner, next app open on a 3.2.5/58 device):** ① cold-open
Home: hero paints immediately (no full-screen spinner), bands fill in
progressively; ② Shop: typing in search stays smooth (memoized cards);
③ Cart: swipe Home→Shop→Cart repeatedly — list stays put (no re-render
flicker) and badge still matches; ④ no spurious "update available" pill on
launch (the single-check guard must not change update UX); ⑤ Menu →
Update screen still reports the correct 3.2.5 (58). **Full sheet:
`guide/DEVICE-RERUN-PERF-OTA-2026-09-25.md`** (pre-flight server-side
checks pre-verified: manifest live, update group `f50d69aa…` = newest on
branch `main`, runtime 3.2.5, android+ios).

**DONE 2026-09-25 — U-37 MIRROR + WEBSITE ROUND CLOSED (app-side bookkeeping).**
The website's 2026-09-25 owner UX revision round (`guide/SESSION-2026-09-25-UX-REVISION.md`)
is fully executed + live-verified: U-35 link-import (edge redeployed,
`verify-link-import.mjs` **40/40**), U-36 project categories, U-37 admin 12→6 tabs
(web `b592627`/`15a0192`; **app mirror = `8b9b8c9`** — adminTabs, parity test,
AdminScreen merged panels), U-38a–d public design (fonts/density/5-up cards/footer),
U-38e home printing + pilot showcase (web `7f877dd`), `staff-access-e2e.mjs`
**ALL PASSED (31)**, web TRACKS U-34 flipped **DONE** (`4dc8a97`), final prod
ux-audit 60 loads · **0 hard** (only pre-existing 32px "View" pill softs on
/3d-printing + /tools — candidate min-h-9 bump next snag round). App side needs
nothing further this round; owner's app-side + mobile-browser snag lists arrive
in the next round.

**DONE 2026-09-24 — U-24 OWNER MULTI-FRONT REVISION ✓ COMMITTED + PUSHED (app `4e3e5fd` ·
web `b0aacfc`; CI + OTA green).** Full plan/root-causes/progress in
`guide/SESSION-2026-09-24-OWNER-REVIEW.md`; web ledger: web TRACKS `U-24`. **P1** owner admin
access (web role plumbing — owner role no longer collapses to customer; app unchanged).
**P2 GHOST-CART FIX (app):** `cartService.pruneOrphanLines(lines, validIds)` keeps only
active-product ids (no-op offline), memoized `productService.listActiveProductIds()`,
`refreshCartCount` prunes + re-persists, sign-in merge prunes merged lines, `signOut` →
`cart.clearCart()` + badge 0 → the "6 items while logged out" phantom is gone; cartService
tests extended (prune block; **31/31**, suite **189/189**). **P3 import/extract:** app
`AdminScreen` import-by-link now uses a real cross-platform URL Modal
(`importLinkOpen`/`importLinkDraft`, confirm→preview→seed editor→Products tab) — replaces the
iOS-only `Alert.prompt` that silently died on Android; web AdminProducts save/toggle try/catch;
edge link-import honors reviewed image/gallery overrides. **P4** MakerWorld-standard extraction:
canonical `makerworldStructuredSpecs` (Compatible / Dimensions W×D×H mm / Weight / Materials /
Filament types by name / Print time — instance titles dropped), description cap 420 + stat-noise
strip, category hint → live 10-category taxonomy, `import_meta.structuredSpecs`/`subcategory`;
credit UI: app ProductDetail credit block (Design by / License / Source) + **Specifications**
section from `structuredSpecs` (fallback: parsed specs). **P5** whole-image cards (app
`resizeMode="contain"`). **P8** organized detail sections app-side (Description → credit →
price/CTA → info grid → Audience/Warranty → Color/Delivery → Specifications → Project info →
related). **P7** app admin parity verified (import modal compiles, tab parity test green).
Gates: app tsc 0 · vitest **189/189** · prettier clean; web tsc 0 · lint 0 · vitest **123/123**
· build green. Live: `verify-link-import` **40/40 ×2**; post-deploy UX audit 60 loads ·
**0 hard failures** at 320/360/768/1440. JS-only round — rides the next OTA, no version bump.

**DONE 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX,
executed (rides the next JS-only OTA — no version bump).** Full plan + decisions in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md`; web-side ledger: web TRACKS/INDEX
`U-23`. App work executed + gated: **MenuScreen redesign** (unified `MenuItem` row for
nav + toggle variants, `MenuGroup` cards, 48pt rows, icon chips, hints, Pro chip, Dark
theme / biometric admin lock / haptics switches), **ProductDetail sticky CTA bar**
(pinned bottom bar with safe-area padding; qty stepper now 44pt buttons +
`accessibilityRole`; keeps Control-this-car + Request-quote), Shop/Projects/Home/admin
consume the shared `ProductCard` (gallery-aware covers, spec chips), ProductEditor +
ProjectsScreen gallery-aware media, restored 5 firmware projects editable in admin
(`4wd4m-basic` / `2wd1m-basic` / `self-balancing-basic` / `esp32-remote` /
`smart-dustbin`, `productType:'Project package'`, category `Robot Cars`, quote-only),
adminTabs reordered to the grouped contract (12 tabs — parity pinned), owner
full-access verified. Edge `link-import` re-deployed + schema (`gallery`/`import_meta`)
applied live by the website side. Gates: app tsc 0 · vitest **185/185** · prettier
clean; web tsc · lint · vitest **123/123** · `npm run build` ✓ · prettier clean; live
harnesses 40/40 + 9/9 + 10/10 + 15/15 + 11/11 + staff-access-e2e **28/28** (new
disposable-owner path). **COMMITTED + PUSHED 2026-09-24 (`f101b06`, main) — CI ✓ · OTA
Only ✓ (bundle published, v3.2.5, no version bump/APK).** This commit also landed the
U-22 unification-round app work that was still "awaiting owner go" (C7/C5/A-screens).
Web side `536ab13`; post-push prod re-verify 27 PASS · 0 SNAG · 0 FAIL · 2 DEFER.

**PLANNED 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX
(planned scope — executed above).** Owner-agreed plan in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md` (Q&A answered 2026-09-24); decisions:
① restore ONLY the 5 GENUM firmware projects from the workspace root — skip Robo Cars/
tutorials; ② admin tabs grouped (Dashboard/Orders/Products/Projects/Services | Journal/
Content | Users/Messages | Finance | Activity | Settings) + parity; ③ full gallery cap ~8 +
backfill existing products from saved source links; ④ image-led taller cards + spec chips;
⑤ light/non-invasive staff extras; ⑥ source credit line. App work: `MenuScreen.tsx` redesign
(single MenuItem row for nav+toggles, professional grouping, kill double-padded row),
ProductDetail gallery + sticky CTA + get quantity buttons, Shop card/touch pass,
app import-by-link MUST send the previewed image + gallery on save (fix "extraction not
working / no photo after save"), Projects restore surfacing (`ProjectsScreen.tsx:82-90`,
`projectService.ts:29-32`), adminTabs reorder (`src/config/adminTabs.ts`) + parity test,
owner full-access verification. Rides the next JS-only OTA — no version bump. Execution
starts in a later session on owner go.

**LATEST (2026-09-24, rides the next OTA — JS-only):** **C5 CLOSED + C7 + UNIFICATION
ROUND PLANNED (owner: "mirror everything except Remote, through Supabase").** Read
`guide/SESSION-2026-09-24-UNIFICATION.md` FIRST — it is the authoritative log for this
round. Done 2026-09-24: ① **C7 — biometrics + haptics:** `expo-local-authentication` +
`expo-haptics` (SDK-54), `services/biometricsService.ts` (local opt-in
`genum-biometrics-admin`, default OFF, enable-requires-passing-prompt, PIN fallback kept),
`services/hapticsService.ts` (tap/impact/success/warning/selection; toggle
`genum-haptics` default ON; never throws; Vibration fallback) replacing ~20 raw
`Vibration.vibrate` call sites (Remote ×7, Tools ×4, Drive/Drone/ModeChooser,
AccountSheet, FloatingRemoteButton); Menu → Security (staff-only biometric admin-lock
switch) + Menu → Feedback (haptics); AdminScreen biometric lock overlay re-arms on every
foreground via AppState. +20 tests. ② **C5 app surface:** `config/socials.ts` (pure
helper mirroring web lib/socials 1:1) + `components/SocialsRow.tsx` (Feather chip row,
empty=hidden) in ContactScreen; scaffolding (schema cols, helpers, editors both clients)
verified complete — WhatsApp/socials are admin-editable in the SHARED company_info row.
③ **A1 PENDING (bug):** Control Panel category tagline/description render EMPTY —
`projectCategoryService.mapRow()` hardcodes "" (DB has no such columns, live-probed) and
ToolsScreen renders them directly; fix = bundled-catalog fallback by slug + thread DB
capability_labels. Gates: app tsc 0 · vitest **178/178** · prettier clean.

**UPDATE 2026-09-24 (later same session) — round COMPLETED + C7 SAFETY REVISION.**
⚠️ **Do-not-regress lesson (native deps + OTA):** release.yml's paths filter watches
`mobile/package.json`/`package-lock.json`, so adding expo-haptics +
expo-local-authentication (C7) correctly triggered an APK rebuild — same 3.2.5/58
labels, new bytes. The CI OTA bundle (runtime 3.2.5) can therefore run on devices with
the PREVIOUS 3.2.5 APK that lacks those native modules. Fix shipped: `safeNative.ts`
(cached lazy require + test injection); haptics degrades to the raw Vibration API and
biometrics reports "unsupported" (Menu row hidden, gate fails closed) when the native
side is absent — static imports of the native modules are gone. **Rule: any new native
dep must degrade gracefully in JS until its first APK ships.** App vitest now
**180/180** (native-absent degrade paths pinned). CI after the pushes: app CI ✓ · OTA
Only ✓ (bundle published for 3.2.5) · Release APK ✓; web CI ✓ · Sync app fallback ✓.
W1 live probe `scripts/web-save-image-parity.mjs` **6/6 vs prod** (staff save with a
foreign image URL → storage URL stored → next/image serves it → public catalog carries
it), committed `1935bad` → rebased over bot `7dd7c04` → pushed `dd7a5e6`.

**UPDATE 2026-09-24 (earlier) — round COMPLETED.** Full detail in
`guide/SESSION-2026-09-24-UNIFICATION.md`; parity matrix
`guide/UNIFICATION-AUDIT-2026-09-24.md`. **A1 fixed:** mapRow falls back to the bundled
catalog's tagline/description by slug (DB columns don't exist), and DB
`capability_labels` now thread through `ProjectCategory.capabilityLabels` with
ToolsScreen rendering admin labels → static map → raw key. **A3 done:**
`services/newsletterService.ts` + Account Newsletter card (required-consent checkbox,
same wording as web) → new edge `newsletter-subscribe` (deployed + live-verified:
validation, 20/min rate limit, idempotent upsert with source refresh, staff/admin
gated GET/DELETE; uses the service role after root-causing that the anon upsert
violates the staff-only RLS UPDATE policy on conflict). **A6 done:** PrintingScreen now
renders the live "Models we print" strip (category `3D Models` from the shared products
table — same rows as the website) routing to ProductDetail. **A7 done:**
OrderSuccessScreen gained the WhatsApp nudge ("I just placed an order.") + SocialsRow
from the shared company row, mirroring web checkout-success. Parity status: every
customer/admin surface is mirrored through Supabase except the documented intentional
divergences (web-push settings card = web-only; app update screen = app-only; Remote =
app-only per owner D-1). Gates: app tsc 0 · vitest **178/178** · prettier clean; web
tsc 0 · lint 0 · vitest **118/118** · build green; harnesses 9/9 + 27/27 (link-import
extended) + 10/10 + staff-e2e ALL + stock 15/15 + newsletter 11/11. **Nothing committed
yet — owner go needed.**

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C3 — RELATED PRODUCTS +
RECENTLY VIEWED (website U-20).** Both clients now share the same discovery helpers,
mirrored 1:1 (`productService.ts` ← web `lib/catalog.ts`):
`relatedProducts(all, current, limit=4)` — same category first ordered by price
proximity, then same-type active items — and `pushRecentlyViewed` /
`resolveRecentlyViewed` (most-recent-first, deduped, capped at 8, active-only, current
product excluded). App surfaces: **ProductDetail** records views to AsyncStorage and
renders "Related products" + "Recently viewed" horizontal strips (4-up cards matching
the Home grid idiom); **Shop** gains a "Recently viewed" strip above the grid, re-read
on every focus via `useFocusEffect` (navigation.push keeps Shop mounted, so a
mount-only effect would go stale). Storage is best-effort — disabled storage just hides
the rows. 5 new tests in `catalogFilters.test.ts` (ordering, cap, dedupe,
inactive-skip, no-mutation), identical to the web suite. Gates: app tsc 0 · vitest
**155/155**; web tsc 0 · lint 0 · vitest **106/106** · build green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C8 — APP POLISH: SKELETONS,
PULL-TO-REFRESH, LOGGER WIRING.** ① Shop loading state is now a skeleton grid
(`components/SkeletonCard.tsx` — 2-column card-shaped placeholders with an opacity
pulse, `ShopSkeletonGrid`) instead of a bare spinner, so the grid doesn't jump when
data arrives. ② Account tab gained pull-to-refresh AND stopped clipping: the root is
now a `ScrollView` (+`RefreshControl`) instead of a plain `View`; both orders and
messages reload via one shared `reload()` used by the initial effect and the pull.
③ Silent catch blocks now log through `services/logger.ts` (error = all builds, warn =
dev only): AccountScreen (order/message loads + profile save — was a `// no-op` that
made Save look dead), ContactScreen (company-info fallback + send failure),
AppContext (session restore, server cart push, cart merge on sign-in), and
productService's live→cache fallbacks. Intentional-quiet catches (BLE/control hot
paths, AsyncStorage cache writes, `setColorScheme` platform guard) were left alone.
Gates: app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C2 — SHOP SORT + PRICE/STOCK
FILTERS (website U-18, app parity `f058200`).** The Shop tab now has: sort (Featured /
Price low-high / Price high-low / Name A–Z), a max-price ceiling picker (500–10,000 NPR
buckets; quote-only rows never match a ceiling), and an in-stock-only toggle — mirroring
the website's `/products` 1:1 (shared helper names/behavior in `productService.ts`:
`sortProducts`/`withinPrice`/`inStockOnly`, tests in `catalogFilters.test.ts`). UI reuses
`CategoryDropdown` for both pickers + a checkbox-style toggle; empty state gains a
"Clear filters" button. Web side: URL-shareable state (`?sort=&maxPrice=&inStock=`) and
the same params accepted by `GET /api/products`. Gates: web tsc 0 · lint 0 · vitest
**101/101** · build green; app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C1 — STOCK DECREMENT ON PAID
ORDERS (website U-17).** Stock now leaves the shelf exactly once per order, at the
pending→paid moment, and comes back on cancel — enforced in the DATABASE, not the
clients. Three SECURITY DEFINER RPCs in the shared `supabase/schema.sql`:
`adjust_order_stock(items, direction)` (decrement clamps at 0 / restore),
`mark_order_paid(order_id, provider_ref)` (row-locked + idempotent: decrements items and
flips status→paid in ONE transaction; a webhook/redirect race can never double-decrement),
`restore_order_stock(order_id, expect_status)` (restore + atomic flip→cancelled, guarded
so a retry can never double-restore). Server side: website confirm routes + admin PATCH
(`lib/orders.ts` transition-aware: pending→paid decrement, paid/fulfilled→cancelled
restore, cancelled→paid re-decrement, paid→fulfilled no-op) and edge fns
`payment-esewa`/`payment-khalti`/`payment-webhook` (redeployed ACTIVE). **App side:
`adminService.updateOrderStatus` mirrors the same transitions via `supabase.rpc(...)` —
the stock RPCs re-verify staff+ server-side, so a customer token is rejected.** Buyer
flows need no change (pay path is the edge fns). Schema applied live; new harness
`genumsolutions-website/scripts/verify-stock-rpc.mjs` **15/15 PASS** vs prod. **IMPORTANT
for app checkout: the shared edge payment functions had never actually worked** — they
boot-crashed in prod (missing `NEXT_PUBLIC_*` env fallbacks) and the ESEWA/KHALTI secrets
were never set. Now fixed + live-verified (web `a2c97e2`). NOTE for future deploys: the
three payment fns MUST be deployed with `--no-verify-jwt` (the app initiates payments with
bare fetches; a plain deploy 401s every app checkout). Gates:
web tsc 0 · lint 0 · vitest **92/92**; app tsc 0 · vitest **140/140**; live harnesses
9/9 + 25/25 + 10/10 + 25/25.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **RICHER LINK-IMPORT EXTRACTION
(website U-16) — "make the extraction better so manual input may not be required."** The
shared `link-import` edge function now extracts MakerWorld **specs** (print profile,
weight, materials, filament types, compatible printer/nozzle), a **full gallery** of
images, an **enriched description** (clean summary + `Printed N times · N likes · N
collected · License:`), and pricing/category metadata in `extra`; the generic path picks
up multiple og:image/itemprop images + JSON-LD `additionalProperty` specs. App side:
`LinkPreview` gained `specs`/`priceLabel`/`extra`, **import-by-link seeds the editor with
`specs`**, and `createLinkImport` sends `specs` so the created row stores them (web
`AdminProducts.tsx` does the same). Edge fn deployed live (**verified 22/22** incl. 9-image
gallery + 5 spec lines). App tsc clean, vitest **140/140**. NOTE: the website harness
gained a cleanup guard (never deletes pre-existing/curated rows on upsert-collide) after a
harness run overwrote+deleted a live sample row — restored on the website side. Website gates:
tsc clean, lint 0, vitest **92/92**.

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

**Current state (2026-09-27):** **3.2.6 / versionCode 59** (`4f8ed03`) — released via CI
(bump push → release.yml built + uploaded the APK; website fallback synced by bot).
3.2.6 carries the U-47 v1→v7 app line (see the DONE block at the top of this file) on top of
the 3.2.5/58 round (tiers + robot preferences, isPro, pro-gated Remote, residue cleanup,
P6 role-revoke/icon) — historical release chain: 3.2.3/56 → 3.2.4/57 (2026-09-21) →
3.2.5/58 (`5fd10b1`, 2026-09-22) → 3.2.6/59 (2026-09-27). Vitest **205/205**, CI green.
Owner device pass pending — the FIN-36 gate.

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

0. ✅ **DONE (long since) — RBAC levels + Admin Settings→Content reorg: shipped 2026-09-22/23.** Phases B+C landed in BOTH repos on 2026-09-22 (web `0bc4d2d`+`8cdbe8f`, app `b8a87bf` RBAC + `862d1c7` phase-C Content reorg — verified in git history 2026-09-26); U-15 gap-close web-only 2026-09-23 (`lib/roles.ts` ladder, AdminRows Hide/Show, admin-roles tests). This entry previously said "PLANNED" — stale ledger prose, the round was never logged app-side. **Re-verified live 2026-09-26: `staff-access-e2e.mjs` ALL PASSED vs prod** (staff read/edit 200 + deletes/role-change/robot-settings-delete 403 · admin user-delete 403 · customer 401 ×3 · owner full incl. user-delete 200; disposable probes cleaned up). App state today: `AppContext` isStaff/isOwner ✓ · AdminScreen owner gating ✓ · Content tab holds the 3 editors (training/pilot/curriculum) with Settings Company-only ✓. No code work outstanding; see web TRACKS U-10/U-15 for the full record.

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
3. 🔜 **FIN-36:** version-defining commits — **STALE at 3.2.5 (2026-09-22 staging); re-stage
   after the U-47 device pass:** app **`v3.2.6` → `4f8ed03`** (the bump commit), website
   **`website-v3.2.6` → the current fallback-sync bot commit**, then `guide/FIN-36-TAGS.sh
--dry-run` before cutting. Firmware targets unchanged (v1.6.6 / v1.0.10 / v1.8.3 / v1.2.5).
   Cut ONLY after the device gate passes.
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

## 2026-09-23 — advanced round (Phases A/B/C)

**Commits:** app `87ff579` (C9 hygiene).

**Phase A:** app `ProductsTab` gains `fromLink` prop; `ProductEditor` label becomes **"Save imported product"** while `pendingImportUrl` set; extracted-image thumbnail shown above the Image URL input; `createLinkImport` path unchanged (edge `action: create` still supported).

**Phase B:** app admin mirrors web admin anatomy (parity test `tests/admin-parity.test.ts` pins `TABS` order+IDs — web tab strip grouped with icons + ARIA). App side: no structural change needed beyond the Phase A `fromLink` support.

**Phase C9:** `mobile/package.json` gains `lint:check` (`tsc --noEmit`), `format`/`format:check` (`prettier`) scripts; `prettier`/`husky`/`lint-staged` added to devDeps; `.husky/pre-commit` (`npx --prefix mobile lint-staged`) + `.lintstagedrc` at repo root; `mobile/package.json` has `"prepare": "husky"` so `npm install` creates `.git/hooks/pre-commit` for new contributors; stale `mobile/.husky/pre-commit` removed. Keystore (`mobile/keystores/keystore.properties`, `genum-release.jks`) confirmed gitignored (`/keystores/`) with `plugins/with-release-signing.js` reading from `../keystores/keystore.properties` and falling back to debug signing.

**Gates:** app tsc 0 · vitest 140/140. Live harnesses green.

## 2026-09-24 — R6 UX audit round (code-path walkthrough)

**Fixed:** Journal "Get in touch about this" was a dead button (`onPress={}`) —
now pushes Contact (mirrors web `/contact` CTA); trend-brief WEF/IFR/UNESCO
links were inert text — now open via Linking (mirrors web). CartScreen no
longer shows "Your cart is empty" when the catalog fetch fails — honest
offline/can't-verify state instead.

**Fixed (deployed edge fns, shared with web):** `contact` + `site-content` were
never deployed (404) and then crashed on `NEXT_PUBLIC_*` env names — app
contact submissions now persist + succeed; home hero loads from `site_content`
DB row with bundled fallback. Lesson (repeat of C1): edge functions must fall
back to standard `SUPABASE_URL`/`SUPABASE_ANON_KEY` names AND must be in the
deploy list for every release.

**Verified:** navigation graph covers every web destination; cart→checkout→
success guards sound; payment deep-link states present.

**Gates:** tsc 0 · vitest 180/180 · prettier clean.

## U-25 audit (2026-09-25) �?" today's work: app cleanup (from both-repo audit)

Read-only audits done. App-side actions for today:

**DEAD (remove, 0 importers verified by audit):**
src/components/AppUpdateCard.tsx ; src/components/tools/Joystick.tsx
src/services/orderService.ts:196/208/220/232 (admin fns dup of adminService
394/403/522/531 �?" delete dup set, keep adminService)
src/services/settingsService.ts:58/93/104/141/147 orphans
Dead env EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID refs; unused
EXPO_PUBLIC_EAS_PROJECT_ID refs.

> **✅ CLOSED by U-48 (2026-09-27).** Every item above was re-verified to have zero references
> (tests included) immediately before deletion, then deleted. Gates after: tsc 0 · vitest 205/205 ·
> prettier clean. One correction to the original audit:
>
> **⚠ `EXPO_PUBLIC_EAS_PROJECT_ID` was listed as an unused ref but is NOT dead** — it is a live
> documented fallback in `src/config/push.ts` (alongside `app.json` `extra.eas.projectId`) and is
> named in the error text in `src/services/pushService.ts`. It was deliberately **kept**; removing
> it would break push on builds where the env var is the only source. The other two env items are
> genuinely gone (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` has no reference anywhere).

**PARITY (align with web card a9dd8b5):** ProductCard media root was already
square (aspect-[] / aspect-square, pushed 76a2327) �?" no rework needed; price
label/CTS unchanged this round.

**Keep hermetic:** no UI/dispatch changes until owner signs off batch.

**Gates each batch:** tsc --noEmit + prettier + vitest �?" update this ledger + app
INDEX per step.

## U-30a (2026-09-25) — shared-Supabase ledger (mirror of web U-30; see web TRACKS for full read-only audit)

DB audit ran READ-ONLY against the SHARED project via SUPABASE_DB_URL
(24 public tables / 45 indexes / RLS on all; page_views = 15k rows / 2.8MB
is the only MB-scale grower, no retention). Storage census on the same
project: product-images bucket = 634 MB (329 objects), app-releases =
1,576 MB (44 objects) — combined ~2.2 GB against the free-tier 1 GB
storage cap ⇒ that is what the Supabase "limit" email is about. NO
mutations performed. Cleanup is QUEUED (page_views retention batch +
confirmed-orphan image deletion after backup) and needs owner go — see
web TRACKS/INDEX.md U-30 for the exact safe-ordered plan + SQL.

## U-31 (2026-09-25) — storage cleanup EXECUTED + release-path prune so it can't rebuild

Owner authorized the queued cleanup. Executed against the shared project
(full detail + per-bucket numbers in web TRACKS/INDEX.md U-31):
app-releases 44 -> 5 objects (1,576 -> 162 MB) and product-images 329 -> 72
(634 -> 104 MB); total 2,210 -> 266 MB, i.e. back under the free-tier 1 GB
storage cap that triggered the Supabase limit email. page_views needed no
retention: all 16,229 rows are dated within 2026-08-25..2026-09-25 (2.8 MB),
and `created_at` was already `NOT NULL DEFAULT now()` — no schema bug.

CODE (this repo) — `mobile/scripts/upload-release.mjs` now prunes superseded
versioned APKs after the manifest is published, so the 1.5 GB cannot silently
rebuild with every release:

- New `--keep <n>` flag (default 3). `pruneOldReleases()` lists the bucket via
  the Storage REST API (plain fetch, no new dependency — the script is
  self-contained by design), keeps the newest N `genum-solutions-<semver>.apk`
  by `created_at`, and removes the rest in one batched DELETE.
- SAFETY: `release.json`, `genum-solutions-latest.apk` and the CURRENT
  `genum-solutions-<version>.apk` are in a protected set and can never be
  pruned at any `--keep` value, so the manifest, the website `/app` page and
  the in-app updater can never be pointed at a deleted APK.
- A prune failure only warns — it never fails an already-published release.
- Verified: 10/10 assertions on the real function (mocked fetch, no live
  calls) covering the no-op case, correct oldest-first removal, and the
  protected-set guarantees at keep=3 and keep=1; REST list+delete shapes
  probed against the live bucket; prettier + `tsc --noEmit` clean; vitest
  189/189.

NEXT: perf batch (HomeScreen progressive render, CartScreen/ShopScreen mount
dedupe, single OTA check, memoized list items) and the admin dashboard uplift.
# NEXT SESSION — genumsolutions-app (session close 2026-09-29: round 4 queued; current release 3.2.7/60)

## ⚠️ READ THIS FIRST — session continuity for the next AI

This session is ending; a DIFFERENT AI continues. Trust order: **git + `sed`/`grep` on disk are
the ONLY ground truth.** Late in this session the tool layer intermittently returned
fabricated/contradictory file echoes (nonexistent paths, phantom listings, edit confirmations
against files never targeted). Known-good anchors if echoes look wrong:
`git -C genumsolutions-app log --oneline -1` (expect `3493eda` or later), clean `git status`,
and the files verified in this session's early, reliable reads:
`mobile/src/screens/ToolsScreen.tsx` (572 lines pre-F-47), `mobile/src/components/tools/
ConnectionBanner.tsx`, `mobile/src/transports/adapters.ts`, `mobile/src/components/tools/
types.ts` (`SensorGridProps` at ~line 338, `SensorData` at ~line 8), `mobile/src/services/
carProtocol.ts` (CarTelemetry ~line 35: rssi/signal/ssid/ap/uptimeMs/freeHeap), `mobile/src/
components/tools/useControlHub.ts` (activeCategory ~189, relays ~280, toggleRelay ~1922,
hub return block ~2148), `mobile/src/screens/RemoteControlScreen.tsx` (landscape lock ~467-490,
deck branch ~804, hub destructure ~276-292). Re-verify line numbers — files shifted with F-47.

## RELEASED THIS SESSION (all verified: CI + OTA green, release.json confirmed)

1. **Car-profiles round pushed + published** (`fb7d1c3`→`648ed6a`, OTA `36590526975`, manifest
   → `648ed6a…`). DB `car_profiles` live, app sync-on-connect, website account panel. Device
   rows: TESTING.md **U-52-1..5** (owner, still open).
2. **Control Panel round 3** (`2a8b406` F-46 · `ca5822d` F-48 · `f890a2e` F-47, OTA
   `36593994243`, manifest → `f890a2e…`): false `statusCallbacks of undefined` connect error
   killed (adapters passed service methods DETACHED — arrow-wrapper fix); banner rows keep body
   text inside the text column (portrait split); disconnect dialog centers on the PHONE
   (sibling of ScrollView). Gates: tsc 0 · vitest 292/292 · prettier clean. Device rows:
   TESTING.md **U-53-1..4** (owner, still open).
3. Docs: FAILSAFES **F-46/F-47/F-48** · GUIDE session log · TRACKS INDEX + NEXT-SESSION
   (`8b6e6c7`).

## PLANNED — approved design, NOT started in code

**A. Per-category decks (owner-approved plan: `guide/PLAN-2026-09-29-CONTROL-PANEL-KINDS.md`).**
7 categories stay separate; robocar + drones decks untouched; five dedicated landscape-only
decks (SmartHome/Farm/City/Dustbin/Handheld) replace the shared SensorGrid fallback; shared
deck kit (DeckCard/DeckSwitch/DeckSensor/DeckPlanned/DeckGrid); honest "Ready for firmware"
chips for unwired controls; parity test = every deck's tile labels disjoint (pure-data
manifest, vitest-safe). Rollout: kit + SmartHome pilot → owner screenshot approval → rest.

**B. ROUND 4 (owner, final message of the session — queued NEXT, nothing built):**
> "using the car access point wifi method, the control panel is showing less-used things about
> other router things like home router and its signal dbm. this should be about the car's AP.
> Same things displayed the car's profile is ok but unnecessary messages and sections totally
> unrelated to the current connection method should be removed. Also start integrating home
> router wifi, and allow the user to add/delete/edit profiles for the wifi routers saved in the
> car or the remote etc that after being connected to the app, and both app and car should be
> in sync. and initially while connecting, such info about the car should be shared to the
> app's memory and then to the database. if the user changes things for the car, that car
> should also save all those things like profile, settings, data, presets etc. Also some
> sections should not be displayed/allowed to open unless the connection is disconnected (like
> the connection methods dropdown) to avoid confusion. The wifi test is good but not properly
> UI/UX designed and stays there even after the work is done. Study the control panel more and
> resolve this."

Broken into buildable items (each = one commit, one concern, like rounds 2-3):

- ✅ **R4-1 SHIPPED (`3a9d2c5`).** CarProfileCard: Saved-routers + Wi-Fi history sections now
  render ONLY while the car is actually on a router (`onRouter`) or nothing is known yet —
  on an AP/Bluetooth link they no longer show "other router things". Smart-link toggle stays
  in every state (it controls what the car does NEXT). ConnectionBanner already split
  `networkKind` correctly; hub strings untouched (carSsid/carApName are car-truth, correctly
  gated by telemetry.connected).
- **R4-1b (remaining, folded into R4-3 scope): on an AP link the banner shows the car-AP
  signal of the PHONE↔CAR link (`telemetry.rssi`/`signal`) — verify this reads as AP signal
  to the owner, not "home router dBm"; the banner Row copy may need "AP signal" wording.
- ✅ **R4-2 SHIPPED (`c029b3e`).** TransportPicker: while `link.id` is set the dropdown chip
  is read-only (press does nothing, combobox→text role, a11y disabled, menu cannot open) and
  `onSelect` refuses to dial — the Disconnect capsule is the one way to change methods.
  Remaining audit (scan/wifi-config sections mid-link) queued with R4-3.
- ✅ **R4-3 SHIPPED (`0e9349c`, 2026-09-29).** Home-router (STA) method unlocked: the gate's
  own condition (SPP + AP device-verified in U-51) was met and the `wifi-sta-ws` transport +
  adapter already existed; `wifi-sta-ws` joined PRIMARY_METHODS in TransportPicker. Also
  **R4-1b/R4-4/R4-5 SHIPPED 2026-09-30** (see the round ledger at the top of this file).
- ✅ **R4-4 SHIPPED (2026-09-30, two commits).** ① TransportPicker gained `onPickedChange` —
  the screen learns which method the user chose (pickedId, null on disconnect; effect-published,
  never render-phase). ② ToolsScreen renders the **Home router settings** section ONLY when the
  chosen method is `wifi-sta-ws`: the same `RouterPanel` the remote's webserver mode hosts
  (Active connection + tappable IP, own network pinned Default, saved list, Add form) PLUS a
  per-row **Edit** action — RouterPanel gained `onStartEdit`/`editingSsid`; the car stores ONE
  password per SSID and ADD is an upsert (T-48a), so edit = pre-filled form → re-ADD; AP/BT
  methods never render it (no method mixing).
- ✅ **R4-5 SHIPPED (2026-09-30, on the existing U-52 engine — NO new table).** The WIP
  `deviceProfileService.ts` found at session start was DISCARDED: it duplicated the
  `car_profiles` store as a second `device_profiles` table (cross-method mixing risk + broken:
  duplicate `upsertDeviceProfile`, missing export, dead effect guard). Instead `car_profiles`
  now also carries `last_wifi_ssid` (name only, never passwords) alongside the existing
  `last_wifi_url`; on adopt the hub restores it — smart-link recency seed + STA address
  prefill. Everything the user changes still lands in deviceMemory first, then mirrors to the
  DB on save (offline-first, unchanged). 4 new engine tests (34/34 in the file).
- ✅ **R4-6 SHIPPED (`fe2e909`).** WifiDiagnosticsPanel: after a run the panel now shows ONE
  summary row (pass/fail tinted, per-verdict count) + a Details chip; the full verdict list +
  probe line collapse until tapped; re-running re-collapses. Panel framing already matched the
  deck family (rounded-xl border-line bg-mist); deep-link from the banner deferred — the panel
  only mounts for WiFi methods (`isWifi && !compact`), so it no longer appears for BT links.

Order for next session: R4-1..R4-7 are ALL SHIPPED (see the two ledgers above); owner device
  rounds **U-54-1..6 + U-55-1..6** are the gate. Next queued design round: per-category decks
  (PLAN-2026-09-29-CONTROL-PANEL-KINDS.md). R4-1/R4-2/R4-6 shipped 2026-09-29, OTA
  `36603138203` green.
- **R4-7 — Menu: "Robot preferences" → "User preferences" + connected-device hub (owner,
  latest message).** Rename the Menu → Robot Settings group item (MenuScreen.tsx ~line 132:
  currently `label="Robot preferences"`, pushes `RobotPreferences`, Pro chip) to **User
  preferences**. The screen becomes the USER hub: ① all user settings + preferences (existing
  robot_user_settings scopes stay), PLUS ② every car/device the user has EVER connected through
  ANY transport (BLE / SPP / WiFi-AP / WiFi-STA / future ones) with main controlling actions:
  set · edit · delete per device, easily, from one place. Data model: extend the existing
  `robot_user_settings` (per user × robot) + the U-52 `car_profiles` engine rather than a new
  table if the shapes fit — the device list is the union of car_profiles rows (fw:<id>/MAC
  keys) and locally-known transports. ③ OFFLINE-FIRST SYNC RULE: every device talks to the app
  over its own media and its data lands in local memory FIRST; the moment the app has internet,
  everything mirrors to the database automatically (same pattern as carProfileService
  push-on-save + pull-on-link; apply the F-45 rule if any schema change is needed — apply DB
  live + probe 200 before claiming done). Owner: "make the database according to that as we did
  in the previous days." Scope note: the car side of R4-4/R4-5 (router profiles + car-side
  persistence) and R4-7 share the same sync engine — build the engine ONCE in R4-5 and reuse.

Order for next session: R4-1 + R4-2 first (pure UI truth fixes, ship as one OTA), then R4-6,
then R4-3→R4-5 (car+DB round; needs firmware/car verify + possibly a new table → F-45 rule:
apply DB live and probe 200 before claiming done), R4-7 rides the same engine once it exists.

## OWNER DEVICE ROUNDS STILL OPEN
`mobile/TESTING.md`: **U-51-1..5** (round 2) · **U-52-1..5** (car profiles) · **U-53-1..4**
(round 3). FIN-36 tag re-stage waits on the device pass (stale at 3.2.7 staging).

## Do-not-regress additions this session
- F-46: NEVER pass `obj.method` as a bare callback — detached `this` throws "Cannot read
  properties of undefined" at runtime while tests pass. Wrap: `(cb) => obj.method(cb)`.
- F-47: Screen-centering overlays render OUTSIDE the ScrollView (sibling under a flex-1 root).
- F-48: Row body text lives INSIDE the single flex-1 text column; accessories only via an
  explicit `trailing` slot.
- Regression-test note: the adapters test was attempted twice; shared-mock typing
  (`onStatus: vi.fn(() => …)` = zero-arg) makes call-arg assertions brittle. If reattempting,
  declare mocks `vi.fn((_cb: StatusCb) => () => undefined)` and mockClear() in each test —
  the file is currently RESTORED CLEAN (no test added).

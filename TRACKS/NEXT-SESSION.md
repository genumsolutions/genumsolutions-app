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

- **R4-1 — Connection-method-aware panel (F-49 candidate).** While a link is ACTIVE, every
  router-flavored section must show AP-truth (car AP name `telemetry.ap` / `4WDCar_Wifi`,
  `telemetry.rssi`/`signal` of the PHONE↔CAR link) — never home-router/STA rows; and STA-only
  sections hide entirely on an AP link (and vice versa). The ConnectionBanner already models
  the split (`networkKind === "sta" | "ap"`); extend the SAME truth to CarProfileCard,
  WifiDiagnosticsPanel, and any hub strings (`hub.carSsid` vs `hub.carApName`).
- **R4-2 — Locked-while-connected sections (F-50 candidate).** Sections that make no sense
  mid-link are hidden or disabled while connected: the **connection-methods dropdown**
  (TransportPicker) collapses to a read-only "Connected via X" chip; method changes require the
  Disconnect confirm first. Audit every other panel section for the same rule (scan, wifi
  config, diagnostics).
- **R4-3 — Home-router (STA) method unlocked.** F-41's gate opens `wifi-sta-ws` for selection
  once R4-4/5 exist (the transport + adapter already exist in `adapters.ts`/`linkManager`).
- **R4-4 — Router profile CRUD (app ↔ car ↔ DB sync).** User can add/edit/delete saved-router
  profiles on the CAR (via the car's WIFICFG protocol, `carProtocol.ts` provisioning lines) and
  in the APP (Car Profile card → Saved routers editor). Contract mirrors `car_profiles`:
  car is source of truth while linked; app persists to AsyncStorage (`savedPrefs` pattern in
  useControlHub) AND mirrors to a cloud table; on link the app pulls car truth → memory → DB;
  on user edit the app pushes to car first, then DB. Passwords NEVER leave car/phone (F-series
  security note: history rows are names + security flags only).
- **R4-5 — Car-side save of everything.** Profile, settings, presets, data the user changes
  must persist on the CAR (NVS/preferences via firmware) and sync back — extend the U-52
  `car_profiles` engine (profile-key focus pull / push-on-save already exists; add the
  router-profile + presets scopes to the same merge helpers).
- **R4-6 — Wifi diagnostics UX (F-51 candidate).** The test panel is functionally good but: not
  properly designed (match the deck-kit card family), and it STAYS OPEN after the run finishes —
  auto-collapse to a one-line result with a "Details" chip when the run completes; deep-link
  from the banner instead of a permanent section.

Order for next session: R4-1 + R4-2 first (pure UI truth fixes, ship as one OTA), then R4-6,
then R4-3→R4-5 (car+DB round; needs firmware/car verify + possibly a new table → F-45 rule:
apply DB live and probe 200 before claiming done).

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

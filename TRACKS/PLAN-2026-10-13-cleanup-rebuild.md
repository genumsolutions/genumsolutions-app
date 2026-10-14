# PLAN 2026-10-13 — Field-fix + cleanup round (APP half, mirror)

Status: **PHASES 0 + 3 + 4 + 5 + 6 DONE — phases 7..9 pending.** This is the app-side mirror of the
car master plan `Genum_4WD4M_CAR\TRACKS\PLAN-2026-10-13-cleanup-rebuild.md`. Shared records
reference: `Genum_4WD4M_CAR\TRACKS\RECORDS-INVENTORY.md`. Cross-repo round log: root
`RESUME-HERE.md`.

Delivery rules that bind this repo:
- **JS-only OTA** — normal UI/logic changes do NOT bump `version`/`versionCode`
  (stays **3.2.7 / 60**). Gate: `npm run typecheck` · `npm run test` · `npm run format:check`.
- Commit + **push after each phase**.

## Owner decisions (app-relevant)
- **Disconnect buttons only under the Back button** on the Remote screen (remove from the
  Connectivity panel).
- **SSID exact `4WD4MCar_WiFi`** in the registry + fixtures/docs.
- **Keep two auto-join toggles, clearer labels** (no merge).
- **DB fresh start**: this car + the owner's account.
- **App sends the real epoch** on connect (car stamps NVS with it).

## Phases (app work)

### Phase 3 — Remote screen layout + IP ⇄ name rotation — **DONE (U-108)**
File: `mobile\src\screens\RemoteControlScreen.tsx` (chrome row ~L689, duplicate A-25
sub-header status ~L754-767, IP chip ~L796, layout/padding L648-652), plus
`components\tools\connection\ConnectionSection.tsx`.
- [x] Status now lives **only right of the Back button** (`deck-link-status`); the duplicate
      sub-header status line is gone, and the Connectivity panel's status+disconnect strip
      (`conn-status-strip`) is removed.
- [x] Extra top padding dropped (`+4` removed); the freed row is the new disconnect row.
- [x] New row **below Back** with separate **Bluetooth** (`remote-disconnect-bt`) and **Wi-Fi**
      (`remote-disconnect-wifi`) disconnect buttons, for every car category.
- [x] IP chip alternates **network name ⇄ IP** ~1 s (mirrors the car OLED).
- Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (version 3.2.7/60 unchanged).

### Phase 4 — connection truth + restart prompt — **DONE (U-108 Phase 4)**
Files: `components\tools\useControlHub.ts` (SPP reconnect/backoff ~L3151-3220,
`setShowSppsRetry`; NetInfo watcher ~L2127-2139; `handleWifiDisconnect` ~L2141-2170),
`connection\ConnectionSection.tsx` (`phoneWifiSsid` NetInfo ~L127/L230).
- [x] The app always knows **which network the phone is on** (`phoneSsidOf` + `phoneSsid` state,
      refreshed on every NetInfo event); surfaced as the `phone-net` chip on the Remote disconnect
      row (`on <ssid>` / `phone Wi-Fi off`).
- [x] Detect car restart via boot-count change (`lastBootSeenRef`, seeded from the persisted
      `savedPrefs.diagnostics.bootCount` so it survives an app restart; first observation only
      seeds — never a false prompt); shows a **Reconnect / Leave / Cancel** banner carrying
      `Boot prev → boot · reset <reason> · N crashes`.
- [x] Carry the restart info on the next connect (the notice persists in the hub until acted on —
      not only after SPP backoff exhaustion, which stays as the separate "Connection lost" banner).
- [x] Real transport status: the "do-needful" states are cleared by the existing `linkVerified`
      contract; no new stub was introduced (both `connected` and `wifiConnected` remain
      transport-truth, `linkVerified` = the car actually answered). Verify on device.
- Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (version 3.2.7/60 unchanged).

### Phase 5 — SSID exact literal — **DONE (U-108 Phase 5)**
Files: `services\carProtocol.ts` (`OWN_AP_NAME`/`OWN_AP_NAMES`), `screens\DeviceConnectionScreen.tsx`
(L172 legacy text), fixtures/tests. Matching is case-insensitive; only display literals change.
- [x] Renamed the literal `4wd4mCar_Wifi` → **`4WD4MCar_WiFi`** across `mobile/src` (source, fixtures,
      tests) + `mobile/TESTING.md` + `TRACKS/INDEX.md` (23 files; 85 insertions / 85 deletions — a
      pure 1:1 rename). The four ALL-CAPS folding probes and the three lowercase probes are untouched,
      so `isOwnApName` case-insensitivity stays proven.
- [x] App half of the car `Config.h` `WIFI_AP_NAME` rename (car batch 1.3.6). Matching is
      case-insensitive, so the app keeps working against a car still on the old casing.
- Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (version 3.2.7/60 unchanged).

### Phase 6 — auto-join labels — **DONE (U-108 Phase 6)**
File: `screens\RemoteControlScreen.tsx` settings toggles (~L1176-1257). Keep both toggles,
give them clearer distinct labels (no merge).
- [x] Kept BOTH toggles (never merged). The CAR boot auto-join (`WIFICFG;AUTOJOIN`, NVS
      `boot_autojoin`) is now **“Boot auto-join (car)”** with a `power` icon and a caption (“On
      power-up the CAR rejoins its last router — off keeps it on its own hotspot.”).
- [x] The APP smart-link toggle is now **“Auto-join saved router (app)”** with a `refresh-cw` icon
      and a caption (“When you open the car, the APP switches it to the strongest saved router it
      hears.”).
- [x] Distinct icons (`power` vs `refresh-cw`), distinct accessibility labels, and a one-line
      caption each. `CarProfileCard.tsx` label matches (“(app)”) and cross-references the car
      setting; the smart-link toast in `useControlHub.ts` updated to the new label.
- Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (version 3.2.7/60 unchanged).

### Phase 7b — Reset car data (app half) — **DONE (U-108 Phase 7b)**

**Owner round 4 / Phase 7b:** the "Reset car data" action that pairs with the car's
`FACTORY;RESET` (Phase 7a).

- **On-connect clock sync:** every link-up (SPP / BLE / WiFi) now sends
  `TIME;<unixEpoch>` so the car can stamp its config writes with a real epoch
  (`botcfg/config_epoch`). Implemented in `useControlHub.ts` by adding a
  `buildTimeLine` send alongside `REQ_STATE` in all three connect handlers.
  `carProtocol.ts` exports `buildTimeLine(epoch)` and `FACTORY_RESET_LINE`.

- **Reset car data action (`resetCarData`):** new function in `useControlHub.ts`
  that (1) sends `FACTORY;RESET` to the car over every live transport,
  (2) wipes ALL car-related AsyncStorage keys:
  `genum.device.index`, `genum.lastDevice`, `genum-car-profiles-v1`,
  `genum.crashReports.queue`, `genum.crashReports.last`,
  `genum.activeTransport.v1`, `genum.app.logs.ring`, `genum.app.logs.pending`,
  plus every per-device `genum.device.<key>` via the index, (3) resets the
  hub's in-memory state (transport toggles → defaults, network lists cleared).
  Exposed in the hook return.

- **UI:** Remote screen settings panel (below the two auto-join toggles) gets a
  red "Reset car data" button with a destructive confirmation dialog (`testID:
  reset-car-data`). The button is always visible but only enabled when a car is
  linked (`linked` gate).

- Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (version
  3.2.7/60 unchanged).

- **DB migration (Phase 7c)** still pending: additive SQL that deletes this car
  (`1FB608`) + owner's car-related rows and adds retention.

### Phases 1 / 2 / 9 (app halves)
- Phase 1: app side is unchanged (car ships the crash record; app already parses
  `RST/BC/CC/PH/LH` → `syncCrashReport`). Verify only.
- Phase 2: keep any app-side telemetry readout (`DriveTelemetry.tsx` / `telemetryFormat.ts`)
  consistent with the car OLED rule.
- Phase 9: `mobile\TESTING.md` device rows + `TRACKS\NEXT-SESSION.md` ledger.

### U-109 (2026-10-14) — control-panel cleanup (app half) — **DONE**
Field-fix + cleanup follow-on (the car half is the own-hotspot boot fix in
`Genum_4WD4M_CAR`). `useControlHub.ts`: dropped retired `ESP_SER`/`ESP_CLI` from
`EVERY_LINK_COMMANDS`; removed the inert `transports/` LinkManager wiring
(`ensureTransportsRegistered` + `linkManager.getActive()`), `chosenRadio: null`;
fixed contradictory comments. `ProjectInfo.tsx`: donor name residue
`"4WD4M": "Wireless Car"` → `"4WD4M Car"`. `transports/` + tests and
`commandRouting.ts` kept as the documented roadmap registry.
Gates: `tsc` 0 · vitest **688/688** · prettier clean. JS-only OTA (3.2.7/60 unchanged).

## RESUME HERE
> Phases 0 + 3 + 4 + 5 + 6 + 7b DONE. **U-109 DONE** (control-panel cleanup: retired-mode tokens,
> inert LinkManager wiring removed, donor label fixed). **DB Phase 7c PENDING** (owner runs migration
> in Supabase). Phase 9 DONE (TESTING.md U-108 rows, docs close-out).

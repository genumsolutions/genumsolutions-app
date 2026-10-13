# PLAN 2026-10-13 — Field-fix + cleanup round (APP half, mirror)

Status: **PHASES 0 + 3 DONE — phases 4..9 pending.** This is the app-side mirror of the
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

### Phase 4 — connection truth + restart prompt
Files: `components\tools\useControlHub.ts` (SPP reconnect/backoff ~L3151-3220,
`setShowSppsRetry`; NetInfo watcher ~L2127-2139; `handleWifiDisconnect` ~L2141-2170),
`connection\ConnectionSection.tsx` (`phoneWifiSsid` NetInfo ~L127/L230).
- Both transports always report real status (clear the do-needful states).
- The app always knows **which network the phone is on** (safe switching).
- Detect car restart via boot-count change; show **Reconnect / Leave / Cancel**.
- Carry the restart info on the next connect attempt (not only after backoff exhaustion —
  today only the SPP retry prompt exists).

### Phase 5 — SSID exact literal
Files: `services\carProtocol.ts` (`OWN_AP_NAME`/`OWN_AP_NAMES`), `screens\DeviceConnectionScreen.tsx`
(L172 legacy text), fixtures/tests. Matching is case-insensitive; only display literals change.

### Phase 6 — auto-join labels
File: `screens\RemoteControlScreen.tsx` settings toggles (~L1176-1257). Keep both toggles,
give them clearer distinct labels (no merge).

### Phase 7 — fresh start + timestamps (app side)
Files: `services\deviceProfileRegistryService.ts` (`genum.device.index`, `genum.lastDevice`,
`genum.device.*`), `services\carProfileService.ts` (`genum-car-profiles-v1`),
`services\crashReportService.ts` (`genum.crashReports.*`), `transports\linkManager.ts`
(`genum.activeTransport.v1`).
- A **Reset car data** action that clears the car-related AsyncStorage keys listed in
  `RECORDS-INVENTORY.md` §2.
- Write `updatedAt` on the remaining car records so staleness is provable.

### Phases 1 / 2 / 9 (app halves)
- Phase 1: app side is unchanged (car ships the crash record; app already parses
  `RST/BC/CC/PH/LH` → `syncCrashReport`). Verify only.
- Phase 2: keep any app-side telemetry readout (`DriveTelemetry.tsx` / `telemetryFormat.ts`)
  consistent with the car OLED rule.
- Phase 9: `mobile\TESTING.md` device rows + `TRACKS\NEXT-SESSION.md` ledger.

## RESUME HERE
> Phases 0 + 3 DONE. Next app work is **Phase 4** (connection truth + restart prompt: both
> transports report real status; the app always knows which network the phone is on; detect a car
> restart via the boot-count change and show Reconnect / Leave / Cancel, carrying the restart info
> on the next connect). Phases 5/6/7 follow (SSID literal, auto-join labels, fresh start + stamps).
